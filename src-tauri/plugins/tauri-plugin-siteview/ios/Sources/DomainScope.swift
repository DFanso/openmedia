import Foundation

/// What to do with a main-frame navigation requested by a session.
enum NavigationVerdict: Equatable {
  case allow
  /// The target is outside the session's domain: show it in the popup browser instead.
  case popup
  case cancel
}

/// A session never leaves its domain. This file holds the rule as pure functions so it can be
/// compiled and tested without UIKit or WebKit.
enum DomainScope {
  /// `www.instagram.com` and `m.instagram.com` both give `instagram.com`; `news.bbc.co.uk` gives
  /// `bbc.co.uk`, and `bob.github.io` stays `bob.github.io` (Public Suffix List). Hosts without a
  /// registrable part (IP addresses, `localhost`) are kept whole.
  static func registrableDomain(of host: String) -> String {
    PublicSuffix.shared.registrableDomain(of: host)
      ?? (host.hasSuffix(".") ? String(host.dropLast()) : host).lowercased()
  }

  /// True for the scope itself and any subdomain of it, never for a lookalike such as
  /// `notinstagram.com`.
  static func contains(scope: String, host: String) -> Bool {
    let host = (host.hasSuffix(".") ? String(host.dropLast()) : host).lowercased()
    let scope = (scope.hasSuffix(".") ? String(scope.dropLast()) : scope).lowercased()
    return host == scope || host.hasSuffix("." + scope)
  }

  /// Decides a navigation.
  ///
  /// - `settled`: false until the session's first load has finished. Until then a redirect to
  ///   another domain (`twitter.com` to `x.com`) is the site finding its own home, so it is
  ///   allowed and the session adopts the final domain.
  /// - Subframes are never blocked; only the page the user sees is pinned.
  static func verdict(
    scheme: String?, host: String?, scope: String, settled: Bool, isMainFrame: Bool
  ) -> NavigationVerdict {
    switch scheme?.lowercased() {
    case "about":
      return .allow
    case "http", "https":
      guard let host, !host.isEmpty else { return .cancel }
      if !isMainFrame || !settled || contains(scope: scope, host: host) { return .allow }
      return .popup
    default:
      return .cancel
    }
  }
}
