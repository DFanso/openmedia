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

class OpenArgs: Decodable {
  let profile: String
  let url: String
  let rect: RectArgs
  let documentStartScript: String?
  let onEvent: Channel
}

class SetRectArgs: Decodable {
  let rect: RectArgs
}

class SetVisibleArgs: Decodable {
  let visible: Bool
}

class NavigateArgs: Decodable {
  let url: String
}

class DeleteProfileDataArgs: Decodable {
  let profile: String
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

/// Hosts one native WKWebView above the Tauri shell webview. The shell owns layout and reports
/// the rectangle; the site view never receives Tauri IPC, only the write-only `openmedia` bridge.
class SiteViewPlugin: Plugin, WKNavigationDelegate, WKUIDelegate {
  private var shell: WKWebView?
  private var siteView: WKWebView?
  private var events: Channel?
  private var observations: [NSKeyValueObservation] = []

  override func load(webview: WKWebView) {
    shell = webview
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
    DispatchQueue.main.async {
      guard let host = self.shell?.superview, let frame = self.frame(for: args.rect) else {
        invoke.reject("shell webview is not ready")
        return
      }
      self.tearDown()
      let view = WKWebView(
        frame: frame,
        configuration: self.makeConfiguration(profileId: profileId, script: args.documentStartScript)
      )
      view.allowsBackForwardNavigationGestures = true
      view.navigationDelegate = self
      view.uiDelegate = self
      host.addSubview(view)
      self.siteView = view
      self.events = args.onEvent
      self.observe(view)
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
      if let frame = self.frame(for: args.rect) {
        view.frame = frame
      }
    }
  }

  @objc public func setVisible(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SetVisibleArgs.self)
    onSiteView(invoke) { $0.isHidden = !args.visible }
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

  @objc public func deleteProfileData(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(DeleteProfileDataArgs.self)
    guard let profileId = UUID(uuidString: args.profile) else {
      invoke.reject("invalid profile id")
      return
    }
    Task { @MainActor in
      do {
        try await WKWebsiteDataStore.remove(forIdentifier: profileId)
        invoke.resolve()
      } catch {
        invoke.reject(error.localizedDescription)
      }
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

  private func makeConfiguration(profileId: UUID, script: String?) -> WKWebViewConfiguration {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = WKWebsiteDataStore(forIdentifier: profileId)
    let controller = WKUserContentController()
    if let script, !script.isEmpty {
      controller.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: false))
    }
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

  private func frame(for rect: RectArgs) -> CGRect? {
    guard let shell, let host = shell.superview else { return nil }
    return shell.convert(rect.cgRect, to: host)
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
