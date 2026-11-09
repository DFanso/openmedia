import Foundation

/// Which site a host belongs to, by the Public Suffix List.
///
/// The data is `shared/public-suffix/resources/public_suffix_rules.txt`, compiled in as
/// `PublicSuffixRules.swift` by `scripts/public-suffix.mjs`. The Rust, TypeScript and Kotlin
/// matchers read the same file, and all of them pass the same vectors.
struct PublicSuffix {
  static let shared = PublicSuffix(rules: PublicSuffixRules.text)

  private var suffixes = Set<String>()
  private var wildcards = Set<String>()
  private var exceptions = Set<String>()

  init(rules: String) {
    for line in rules.split(separator: "\n", omittingEmptySubsequences: true) {
      if line.hasPrefix("!") {
        exceptions.insert(String(line.dropFirst()))
      } else if line.hasPrefix("*.") {
        wildcards.insert(String(line.dropFirst(2)))
      } else {
        suffixes.insert(String(line))
      }
    }
  }

  /// The registrable domain of a host (`news.bbc.co.uk` gives `bbc.co.uk`, `bob.github.io` stays
  /// whole), or nil for an IP address, a malformed host or a host that is itself a public suffix.
  func registrableDomain(of host: String) -> String? {
    var host = host.lowercased()
    if host.hasSuffix(".") { host.removeLast() }
    let labels = host.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
    guard labels.allSatisfy(Self.isLabel),
      let tld = labels.last, tld.utf8.contains(where: { $0 >= 97 && $0 <= 122 })
    else { return nil }
    let suffix = suffixLength(of: labels)
    return labels.count > suffix ? labels.suffix(suffix + 1).joined(separator: ".") : nil
  }

  private func suffixLength(of labels: [String]) -> Int {
    var longest = 1
    for start in labels.indices {
      let candidate = labels[start...].joined(separator: ".")
      if exceptions.contains(candidate) { return labels.count - start - 1 }
      let wildcard =
        start + 1 < labels.count && wildcards.contains(labels[(start + 1)...].joined(separator: "."))
      let length = labels.count - start
      if (suffixes.contains(candidate) || wildcard) && length > longest { longest = length }
    }
    return longest
  }

  /// One to 63 lowercase letters, digits or hyphens, with no hyphen at either end.
  private static func isLabel(_ label: String) -> Bool {
    let bytes = Array(label.utf8)
    guard (1...63).contains(bytes.count), bytes.first != 45, bytes.last != 45 else { return false }
    return bytes.allSatisfy { ($0 >= 97 && $0 <= 122) || ($0 >= 48 && $0 <= 57) || $0 == 45 }
  }
}
