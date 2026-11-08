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
  /// Second-level labels under a two-letter country code (`co.uk`, `com.au`, `ne.jp`). A small
  /// built-in list stands in for the public suffix list: it is exact for the common cases and errs
  /// toward treating an unknown suffix as one label.
  private static let countrySecondLevel: Set<String> = [
    "co", "com", "org", "net", "gov", "edu", "ac", "or", "ne", "go", "gob", "mil",
  ]

  /// `www.instagram.com` and `m.instagram.com` both give `instagram.com`; `news.bbc.co.uk` gives
  /// `bbc.co.uk`. Hosts without a registrable part (IP addresses, `localhost`) are kept whole.
  static func registrableDomain(of host: String) -> String {
    let host = (host.hasSuffix(".") ? String(host.dropLast()) : host).lowercased()
    let labels = host.split(separator: ".", omittingEmptySubsequences: true).map(String.init)
    guard labels.count > 2, !labels.allSatisfy({ Int($0) != nil }) else { return host }
    let tld = labels[labels.count - 1]
    let second = labels[labels.count - 2]
    let keep = tld.count == 2 && countrySecondLevel.contains(second) ? 3 : 2
    return labels.suffix(keep).joined(separator: ".")
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
