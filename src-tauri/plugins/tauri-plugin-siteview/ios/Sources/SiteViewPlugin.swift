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
  let profile: String
  let url: String
  let rect: RectArgs
  let documentStartScript: String?
  let contentRuleLists: [RuleListArgs]?
  let onEvent: Channel
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

class SetDocumentStartScriptArgs: Decodable {
  let script: String
}

struct StateEvent: Encodable {
  let type = "state"
  let url: String?
  let title: String?
  let loading: Bool
  let canGoBack: Bool
  let canGoForward: Bool
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

/// Hosts one native WKWebView *below* the Tauri shell webview. The shell is transparent and draws
/// the floating controls; the shell owns layout and reports the site rectangle. The site view
/// never receives Tauri IPC, only the write-only `openmedia` bridge.
class SiteViewPlugin: Plugin, WKNavigationDelegate, WKUIDelegate {
  private var shell: WKWebView?
  private var siteView: WKWebView?
  private var router: TouchRouter?
  private var events: Channel?
  private var observations: [NSKeyValueObservation] = []
  private var colorScheme: UIUserInterfaceStyle = .unspecified
  /// The shell reports regions once per layout change, possibly before the router exists (the
  /// first `open` can wait on a rule list compile), so keep them for the router to start with.
  private var interactiveRegions: [CGRect] = []

  override func load(webview: WKWebView) {
    shell = webview
    webview.isOpaque = false
    webview.backgroundColor = .clear
    webview.scrollView.backgroundColor = .clear
  }

  // MARK: Commands

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
      self.tearDown()
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
      refresh.addTarget(self, action: #selector(self.pullToRefresh(_:)), for: .valueChanged)
      view.scrollView.refreshControl = refresh
      host.insertSubview(view, belowSubview: shell)
      self.siteView = view
      self.events = args.onEvent
      self.installRouter(in: host).siteView = view
      self.observe(view)
      if let ruleListFailure { self.send(ErrorEvent(message: ruleListFailure)) }
      view.load(URLRequest(url: url))
      invoke.resolve()
    }
  }

  @objc public func close(_ invoke: Invoke) {
    DispatchQueue.main.async {
      self.tearDown()
      invoke.resolve()
    }
  }

  @objc public func setRect(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SetRectArgs.self)
    onSiteView(invoke) { view in
      if let shell = self.shell, let host = shell.superview {
        view.frame = shell.convert(args.rect.cgRect, to: host)
      }
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
    onSiteView(invoke) { $0.load(URLRequest(url: url)) }
  }

  @objc public func goBack(_ invoke: Invoke) {
    onSiteView(invoke) { $0.goBack() }
  }

  @objc public func goForward(_ invoke: Invoke) {
    onSiteView(invoke) { $0.goForward() }
  }

  @objc public func reload(_ invoke: Invoke) {
    onSiteView(invoke) { $0.reload() }
  }

  @objc private func pullToRefresh(_ sender: UIRefreshControl) {
    siteView?.reload()
  }

  @objc public func setColorScheme(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SetColorSchemeArgs.self)
    DispatchQueue.main.async {
      switch args.scheme {
      case "light": self.colorScheme = .light
      case "dark": self.colorScheme = .dark
      default: self.colorScheme = .unspecified
      }
      self.siteView?.overrideUserInterfaceStyle = self.colorScheme
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

  /// Swaps the rule lists on the open site view and reloads it so the page loads under them.
  /// With no site view open there is nothing to change; the next `open` carries the lists.
  @objc public func setContentRuleLists(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SetContentRuleListsArgs.self)
    Task { @MainActor in
      guard let view = self.siteView else {
        invoke.resolve()
        return
      }
      let (ruleLists, failure) = await self.loadRuleLists(args.lists)
      guard self.siteView === view else {
        invoke.resolve()
        return
      }
      let controller = view.configuration.userContentController
      controller.removeAllContentRuleLists()
      ruleLists.forEach { controller.add($0) }
      if let failure { self.send(ErrorEvent(message: failure)) }
      view.reload()
      invoke.resolve()
    }
  }

  /// Swaps the document-start script on the open site view and reloads it so the page loads under
  /// it. With no site view open there is nothing to change; the next `open` carries the script.
  @objc public func setDocumentStartScript(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SetDocumentStartScriptArgs.self)
    DispatchQueue.main.async {
      guard let view = self.siteView else {
        invoke.resolve()
        return
      }
      let controller = view.configuration.userContentController
      controller.removeAllUserScripts()
      if !args.script.isEmpty {
        controller.addUserScript(
          WKUserScript(source: args.script, injectionTime: .atDocumentStart, forMainFrameOnly: false))
      }
      view.reload()
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
    let scheme = navigationAction.request.url?.scheme?.lowercased() ?? ""
    decisionHandler(allowedSchemes.contains(scheme) || scheme == "about" ? .allow : .cancel)
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    send(ErrorEvent(message: error.localizedDescription))
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    send(ErrorEvent(message: error.localizedDescription))
  }

  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    if navigationAction.targetFrame == nil, let url = navigationAction.request.url, webURL(url.absoluteString) != nil {
      webView.load(navigationAction.request)
    }
    return nil
  }

  // MARK: Helpers

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

  private func observe(_ view: WKWebView) {
    observations = [
      view.observe(\.url, options: [.new]) { [weak self] view, _ in self?.sendState(view) },
      view.observe(\.title, options: [.new]) { [weak self] view, _ in self?.sendState(view) },
      view.observe(\.isLoading, options: [.new]) { [weak self] view, _ in self?.sendState(view) },
      view.observe(\.canGoBack, options: [.new]) { [weak self] view, _ in self?.sendState(view) },
      view.observe(\.canGoForward, options: [.new]) { [weak self] view, _ in self?.sendState(view) },
    ]
  }

  private func sendState(_ view: WKWebView) {
    if !view.isLoading { view.scrollView.refreshControl?.endRefreshing() }
    send(
      StateEvent(
        url: view.url?.absoluteString,
        title: view.title,
        loading: view.isLoading,
        canGoBack: view.canGoBack,
        canGoForward: view.canGoForward
      )
    )
  }

  private func send<T: Encodable>(_ event: T) {
    try? events?.send(event)
  }

  private func tearDown() {
    observations.removeAll()
    if let view = siteView {
      view.configuration.userContentController.removeAllUserScripts()
      view.configuration.userContentController.removeScriptMessageHandler(forName: bridgeHandlerName)
      view.navigationDelegate = nil
      view.uiDelegate = nil
      view.removeFromSuperview()
    }
    siteView = nil
    router?.siteView = nil
    events = nil
  }

  private func onSiteView(_ invoke: Invoke, _ action: @escaping (WKWebView) -> Void) {
    DispatchQueue.main.async {
      guard let view = self.siteView else {
        invoke.reject("no site view is open")
        return
      }
      action(view)
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
