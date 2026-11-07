import SafariServices
import SwiftRs
import Tauri
import UIKit
import WebKit

private let bridgeHandlerName = "openmedia"
private let allowedSchemes: Set<String> = ["http", "https"]

struct RectArgs: Decodable {
  let x: Double
  let y: Double
  let width: Double
  let height: Double

  var cgRect: CGRect { CGRect(x: x, y: y, width: width, height: height) }
}

struct RuleListArgs: Decodable {
  let id: String
  let path: String
}

class OpenArgs: Decodable {
  let session: String
  let profile: String
  let url: String
  let rect: RectArgs
  let documentStartScript: String?
  let contentRuleLists: [RuleListArgs]?
  let onEvent: Channel
}

class SessionArgs: Decodable {
  let session: String
}

class SetRectArgs: Decodable {
  let rect: RectArgs
}

class SetInteractiveRegionsArgs: Decodable {
  let regions: [RectArgs]
}

class NavigateArgs: Decodable {
  let url: String
}

class SetColorSchemeArgs: Decodable {
  let scheme: String
}

class FetchFaviconArgs: Decodable {
  let url: String
}

class SetContentRuleListsArgs: Decodable {
  let lists: [RuleListArgs]
}

struct StateEvent: Encodable {
  let type = "state"
  let session: String
  let url: String?
  let title: String?
  let loading: Bool
  let canGoBack: Bool
  let canGoForward: Bool
  let scope: String
}

struct ClosedEvent: Encodable {
  let type = "closed"
  let session: String
}

struct MemoryWarningEvent: Encodable {
  let type = "memoryWarning"
}

struct ErrorEvent: Encodable {
  let type = "error"
  let message: String
}

struct BridgeEvent: Encodable {
  let type = "bridge"
  let origin: String
  let body: String
}

private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
  weak var target: SiteViewPlugin?

  init(_ target: SiteViewPlugin) {
    self.target = target
  }

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    target?.receiveBridgeMessage(message)
  }
}

/// One open page: its native view and the domain it is pinned to.
private final class Session {
  let id: String
  let view: WKWebView
  /// The registrable domain the session may show. Fixed once the first load settles.
  var scope: String
  /// False until the first load finishes or fails; see `DomainScope.verdict`.
  var settled = false
  /// A hidden session whose content rule lists changed reloads when it is shown again.
  var needsReload = false
  var observations: [NSKeyValueObservation] = []

  init(id: String, view: WKWebView, scope: String) {
    self.id = id
    self.view = view
    self.scope = scope
  }
}

/// Transparent view above both webviews. It never handles touches itself: it decides, per touch,
/// whether the shell (inside an interactive region) or the site view underneath receives it.
final class TouchRouter: UIView {
  weak var shell: WKWebView?
  weak var siteView: WKWebView?
  var regions: [CGRect] = []

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard let shell, bounds.contains(point) else { return nil }
    let inShell = convert(point, to: shell)
    let shellOwnsTouch = siteView == nil || regions.contains { $0.contains(inShell) }
    let target: UIView = shellOwnsTouch ? shell : (siteView ?? shell)
    return target.hitTest(convert(point, to: target), with: event)
  }
}

/// Hosts native WKWebViews *below* the Tauri shell webview, one per session, only one visible. The
/// shell is transparent and draws the floating controls; the shell owns layout and reports the
/// site rectangle. Site views never receive Tauri IPC, only the write-only `openmedia` bridge.
///
/// A session never leaves its domain: a main-frame navigation outside it is cancelled and shown in
/// a popup browser (`SFSafariViewController`, which shares nothing with the profile's data store).
/// Which sessions to keep alive is the shell's decision; this class only opens, shows and closes.
class SiteViewPlugin: Plugin, WKNavigationDelegate, WKUIDelegate {
  private var shell: WKWebView?
  private var sessions: [String: Session] = [:]
  private var activeId: String?
  private var router: TouchRouter?
  private var events: Channel?
  private var popup: SFSafariViewController?
  private var colorScheme: UIUserInterfaceStyle = .unspecified
  /// The shell's page rectangle, in shell coordinates; every session's view fills it.
  private var pageRect: CGRect?
  /// The shell reports regions once per layout change, possibly before the router exists (the
  /// first `open` can wait on a rule list compile), so keep them for the router to start with.
  private var interactiveRegions: [CGRect] = []

  override func load(webview: WKWebView) {
    shell = webview
    webview.isOpaque = false
    webview.backgroundColor = .clear
    webview.scrollView.backgroundColor = .clear
    NotificationCenter.default.addObserver(
      forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: .main
    ) { [weak self] _ in self?.send(MemoryWarningEvent()) }
  }

  // MARK: Commands

  /// Creates the session's view, shows it, and keeps every other session alive but hidden.
  @objc public func open(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(OpenArgs.self)
    guard let profileId = UUID(uuidString: args.profile) else {
      invoke.reject("invalid profile id")
      return
    }
    guard let url = webURL(args.url) else {
      invoke.reject("only http and https urls can be opened")
      return
    }
    Task { @MainActor in
      let (ruleLists, ruleListFailure) = await self.loadRuleLists(args.contentRuleLists ?? [])
      guard let shell = self.shell, let host = shell.superview else {
        invoke.reject("shell webview is not ready")
        return
      }
      if let existing = self.sessions[args.session] { self.dispose(existing) }
      self.pageRect = args.rect.cgRect
      let view = WKWebView(
        frame: shell.convert(args.rect.cgRect, to: host),
        configuration: self.makeConfiguration(
          profileId: profileId, script: args.documentStartScript, ruleLists: ruleLists)
      )
      view.allowsBackForwardNavigationGestures = true
      view.navigationDelegate = self
      view.uiDelegate = self
      view.overrideUserInterfaceStyle = self.colorScheme
      let refresh = UIRefreshControl()
      refresh.addAction(UIAction { [weak view] _ in view?.reload() }, for: .valueChanged)
      view.scrollView.refreshControl = refresh
      host.insertSubview(view, belowSubview: shell)

      let session = Session(
        id: args.session, view: view, scope: DomainScope.registrableDomain(of: url.host ?? ""))
      self.sessions[session.id] = session
      self.events = args.onEvent
      _ = self.installRouter(in: host)
      self.observe(session)
      self.show(session)
      if let ruleListFailure { self.send(ErrorEvent(message: ruleListFailure)) }
      view.load(URLRequest(url: url))
      invoke.resolve()
    }
  }

  @objc public func activate(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SessionArgs.self)
    DispatchQueue.main.async {
      guard let session = self.sessions[args.session] else {
        invoke.reject("no such session")
        return
      }
      self.show(session)
      invoke.resolve()
    }
  }

  @objc public func close(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SessionArgs.self)
    DispatchQueue.main.async {
      if let session = self.sessions[args.session] { self.dispose(session) }
      invoke.resolve()
    }
  }

  @objc public func setRect(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SetRectArgs.self)
    DispatchQueue.main.async {
      self.pageRect = args.rect.cgRect
      if let shell = self.shell, let host = shell.superview {
        let frame = shell.convert(args.rect.cgRect, to: host)
        self.sessions.values.forEach { $0.view.frame = frame }
      }
      invoke.resolve()
    }
  }

  @objc public func setInteractiveRegions(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SetInteractiveRegionsArgs.self)
    DispatchQueue.main.async {
      self.interactiveRegions = args.regions.map(\.cgRect)
      self.router?.regions = self.interactiveRegions
      invoke.resolve()
    }
  }

  @objc public func navigate(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(NavigateArgs.self)
    guard let url = webURL(args.url) else {
      invoke.reject("only http and https urls can be opened")
      return
    }
    onActiveSession(invoke) { $0.view.load(URLRequest(url: url)) }
  }

  @objc public func goBack(_ invoke: Invoke) {
    onActiveSession(invoke) { $0.view.goBack() }
  }

  @objc public func goForward(_ invoke: Invoke) {
    onActiveSession(invoke) { $0.view.goForward() }
  }

  @objc public func reload(_ invoke: Invoke) {
    onActiveSession(invoke) { $0.view.reload() }
  }

  @objc public func setColorScheme(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SetColorSchemeArgs.self)
    DispatchQueue.main.async {
      switch args.scheme {
      case "light": self.colorScheme = .light
      case "dark": self.colorScheme = .dark
      default: self.colorScheme = .unspecified
      }
      self.sessions.values.forEach { $0.view.overrideUserInterfaceStyle = self.colorScheme }
      invoke.resolve()
    }
  }

  @objc public func fetchFavicon(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(FetchFaviconArgs.self)
    guard let page = webURL(args.url) else {
      invoke.reject("only http and https urls can be opened")
      return
    }
    Task {
      let icon = await FaviconFetcher.fetch(for: page)
      invoke.resolve(["dataUrl": icon])
    }
  }

  /// Swaps the rule lists on every open session. The visible page reloads under them now; hidden
  /// ones reload when they are next shown. With no session open there is nothing to change; the
  /// next `open` carries the lists.
  @objc public func setContentRuleLists(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SetContentRuleListsArgs.self)
    Task { @MainActor in
      guard !self.sessions.isEmpty else {
        invoke.resolve()
        return
      }
      let (ruleLists, failure) = await self.loadRuleLists(args.lists)
      for session in self.sessions.values {
        let controller = session.view.configuration.userContentController
        controller.removeAllContentRuleLists()
        ruleLists.forEach { controller.add($0) }
        if session.id == self.activeId {
          session.view.reload()
        } else {
          session.needsReload = true
        }
      }
      if let failure { self.send(ErrorEvent(message: failure)) }
      invoke.resolve()
    }
  }

  // MARK: Bridge

  func receiveBridgeMessage(_ message: WKScriptMessage) {
    guard message.frameInfo.isMainFrame, JSONSerialization.isValidJSONObject(message.body) else { return }
    guard
      let data = try? JSONSerialization.data(withJSONObject: message.body),
      let body = String(data: data, encoding: .utf8)
    else { return }
    let origin = message.frameInfo.securityOrigin
    send(BridgeEvent(origin: "\(origin.protocol)://\(origin.host)", body: body))
  }

  // MARK: WKNavigationDelegate / WKUIDelegate

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard let session = session(of: webView) else {
      decisionHandler(.cancel)
      return
    }
    let url = navigationAction.request.url
    switch DomainScope.verdict(
      scheme: url?.scheme, host: url?.host, scope: session.scope, settled: session.settled,
      isMainFrame: navigationAction.targetFrame?.isMainFrame ?? true)
    {
    case .allow:
      decisionHandler(.allow)
    case .cancel:
      decisionHandler(.cancel)
    case .popup:
      decisionHandler(.cancel)
      if let url { presentPopup(url) }
    }
  }

  /// While a session is still on its first load, a redirect may change its domain; the session
  /// adopts wherever the first page committed.
  func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
    guard let session = session(of: webView), !session.settled, let host = webView.url?.host else { return }
    session.scope = DomainScope.registrableDomain(of: host)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    session(of: webView)?.settled = true
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    session(of: webView)?.settled = true
    send(ErrorEvent(message: error.localizedDescription))
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    session(of: webView)?.settled = true
    send(ErrorEvent(message: error.localizedDescription))
  }

  /// A dead web content process leaves a blank view. The visible page reloads; a hidden one is
  /// dropped and the shell is told, so it reopens fresh when the user comes back to it.
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    guard let session = session(of: webView) else { return }
    if session.id == activeId {
      webView.reload()
    } else {
      dispose(session)
      send(ClosedEvent(session: session.id))
    }
  }

  /// `target=_blank` and `window.open`: inside the domain the page loads in place, outside it the
  /// popup browser takes it. Never a second native web view.
  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    guard let session = session(of: webView), let url = navigationAction.request.url else { return nil }
    switch DomainScope.verdict(
      scheme: url.scheme, host: url.host, scope: session.scope, settled: session.settled,
      isMainFrame: true)
    {
    case .allow: webView.load(navigationAction.request)
    case .popup: presentPopup(url)
    case .cancel: break
    }
    return nil
  }

  // MARK: Helpers

  private func session(of view: WKWebView) -> Session? {
    sessions.values.first { $0.view === view }
  }

  /// Makes `session` the one visible page. The others stay alive underneath, hidden.
  private func show(_ session: Session) {
    for other in sessions.values where other !== session { other.view.isHidden = true }
    session.view.isHidden = false
    activeId = session.id
    if let shell, let host = shell.superview, let pageRect {
      session.view.frame = shell.convert(pageRect, to: host)
    }
    router?.siteView = session.view
    if session.needsReload {
      session.needsReload = false
      session.view.reload()
    }
    sendState(session)
  }

  /// Shows the outside page in the system's in-app browser. One at a time: a page cannot stack
  /// popups on top of each other.
  @MainActor
  private func presentPopup(_ url: URL) {
    guard popup?.presentingViewController == nil, webURL(url.absoluteString) != nil else { return }
    var top = shell?.window?.rootViewController
    while let presented = top?.presentedViewController { top = presented }
    guard let top else { return }
    let controller = SFSafariViewController(url: url)
    controller.dismissButtonStyle = .close
    popup = controller
    top.present(controller, animated: true)
  }

  private func installRouter(in host: UIView) -> TouchRouter {
    if let router { return router }
    let router = TouchRouter(frame: host.bounds)
    router.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    router.backgroundColor = .clear
    router.shell = shell
    router.regions = interactiveRegions
    host.addSubview(router)
    self.router = router
    return router
  }

  /// Looks each list up in WebKit's persistent store and compiles it from its JSON file only on a
  /// miss, so the slow compile runs once per list version. A list that fails is skipped and
  /// reported: browsing without blocking beats not browsing, but the user must be told.
  @MainActor
  private func loadRuleLists(_ lists: [RuleListArgs]) async -> ([WKContentRuleList], String?) {
    guard !lists.isEmpty else { return ([], nil) }
    guard let store = WKContentRuleListStore.default() else {
      return ([], "Ad blocking is off: the content rule store is unavailable.")
    }
    var loaded: [WKContentRuleList] = []
    var failure: String?
    for list in lists {
      if let cached = await lookUp(list.id, in: store) {
        loaded.append(cached)
        continue
      }
      do {
        let json = try String(contentsOfFile: list.path, encoding: .utf8)
        if let compiled = try await store.compileContentRuleList(
          forIdentifier: list.id, encodedContentRuleList: json)
        {
          loaded.append(compiled)
        }
      } catch {
        failure = "Ad blocking is partly off: a filter list could not be loaded."
      }
    }
    await removeStaleRuleLists(keeping: Set(lists.map(\.id)), in: store)
    return (loaded, failure)
  }

  private func lookUp(_ id: String, in store: WKContentRuleListStore) async -> WKContentRuleList? {
    await withCheckedContinuation { continuation in
      store.lookUpContentRuleList(forIdentifier: id) { list, _ in continuation.resume(returning: list) }
    }
  }

  /// Old list versions stay in WebKit's store until removed; each is several megabytes.
  private func removeStaleRuleLists(keeping ids: Set<String>, in store: WKContentRuleListStore) async {
    let stored: [String] = await withCheckedContinuation { continuation in
      store.getAvailableContentRuleListIdentifiers { continuation.resume(returning: $0 ?? []) }
    }
    for id in stored where !ids.contains(id) {
      await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
        store.removeContentRuleList(forIdentifier: id) { _ in continuation.resume() }
      }
    }
  }

  private func makeConfiguration(profileId: UUID, script: String?, ruleLists: [WKContentRuleList])
    -> WKWebViewConfiguration
  {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = WKWebsiteDataStore(forIdentifier: profileId)
    // iPhone defaults to fullscreen-only video, which covers the shell's controls. Muted video may
    // autoplay inline; audio still needs a tap.
    configuration.allowsInlineMediaPlayback = true
    configuration.mediaTypesRequiringUserActionForPlayback = .audio
    let controller = WKUserContentController()
    if let script, !script.isEmpty {
      controller.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: false))
    }
    ruleLists.forEach { controller.add($0) }
    controller.add(WeakMessageHandler(self), name: bridgeHandlerName)
    configuration.userContentController = controller
    return configuration
  }

  private func observe(_ session: Session) {
    func watch<Value>(_ keyPath: KeyPath<WKWebView, Value>) -> NSKeyValueObservation {
      session.view.observe(keyPath, options: [.new]) { [weak self, weak session] _, _ in
        if let session { self?.sendState(session) }
      }
    }
    session.observations = [
      watch(\.url), watch(\.title), watch(\.isLoading), watch(\.canGoBack), watch(\.canGoForward),
    ]
  }

  private func sendState(_ session: Session) {
    let view = session.view
    if !view.isLoading { view.scrollView.refreshControl?.endRefreshing() }
    send(
      StateEvent(
        session: session.id,
        url: view.url?.absoluteString,
        title: view.title,
        loading: view.isLoading,
        canGoBack: view.canGoBack,
        canGoForward: view.canGoForward,
        scope: session.scope
      )
    )
  }

  private func send<T: Encodable>(_ event: T) {
    try? events?.send(event)
  }

  private func dispose(_ session: Session) {
    session.observations.removeAll()
    let view = session.view
    view.stopLoading()
    view.configuration.userContentController.removeAllUserScripts()
    view.configuration.userContentController.removeScriptMessageHandler(forName: bridgeHandlerName)
    view.navigationDelegate = nil
    view.uiDelegate = nil
    view.removeFromSuperview()
    sessions[session.id] = nil
    if activeId == session.id {
      activeId = nil
      router?.siteView = nil
    }
  }

  private func onActiveSession(_ invoke: Invoke, _ action: @escaping (Session) -> Void) {
    DispatchQueue.main.async {
      guard let id = self.activeId, let session = self.sessions[id] else {
        invoke.reject("no site view is open")
        return
      }
      action(session)
      invoke.resolve()
    }
  }

  private func webURL(_ string: String) -> URL? {
    guard
      let url = URL(string: string),
      let scheme = url.scheme?.lowercased(),
      allowedSchemes.contains(scheme),
      url.host != nil
    else { return nil }
    return url
  }
}

@_cdecl("init_plugin_siteview")
public func initPlugin() -> Plugin {
  return SiteViewPlugin()
}
