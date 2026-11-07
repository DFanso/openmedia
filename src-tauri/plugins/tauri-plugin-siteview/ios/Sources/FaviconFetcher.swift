import UIKit

/// Fetches a site's icon from the site itself and returns it as a small PNG `data:` URL.
/// Nothing goes through a third-party icon service; the only host contacted is the page's own.
enum FaviconFetcher {
  private static let maxBytes = 400_000
  private static let maxCandidates = 6
  private static let outputSize = CGSize(width: 96, height: 96)

  static func fetch(for page: URL) async -> String? {
    var candidates: [URL] = []
    if let html = await text(from: page) {
      candidates += iconLinks(in: html, base: page)
    }
    for path in ["/apple-touch-icon.png", "/favicon.ico"] {
      if let url = URL(string: path, relativeTo: page)?.absoluteURL {
        candidates.append(url)
      }
    }

    var tried = Set<URL>()
    for url in candidates {
      guard tried.count < maxCandidates, tried.insert(url).inserted else { continue }
      if let png = await png(from: url) {
        return "data:image/png;base64," + png.base64EncodedString()
      }
    }
    return nil
  }

  private static func get(_ url: URL) async -> Data? {
    var request = URLRequest(url: url)
    request.timeoutInterval = 8
    guard
      let (data, response) = try? await URLSession.shared.data(for: request),
      (response as? HTTPURLResponse)?.statusCode == 200,
      data.count <= maxBytes
    else { return nil }
    return data
  }

  private static func text(from url: URL) async -> String? {
    guard let data = await get(url) else { return nil }
    return String(decoding: data, as: UTF8.self)
  }

  private static func png(from url: URL) async -> Data? {
    guard let data = await get(url), data.count > 100, let image = UIImage(data: data) else { return nil }
    return UIGraphicsImageRenderer(size: outputSize).pngData { _ in
      image.draw(in: CGRect(origin: .zero, size: outputSize))
    }
  }

  /// `<link rel="...icon..." href="...">` targets, touch icons first (they are larger).
  private static func iconLinks(in html: String, base: URL) -> [URL] {
    guard let tags = try? NSRegularExpression(pattern: "<link\\b[^>]*>", options: [.caseInsensitive]) else { return [] }
    let range = NSRange(html.startIndex..., in: html)
    var touch: [URL] = []
    var plain: [URL] = []
    for match in tags.matches(in: html, range: range) {
      guard let tagRange = Range(match.range, in: html) else { continue }
      let tag = String(html[tagRange])
      guard
        let rel = attribute("rel", in: tag)?.lowercased(), rel.contains("icon"),
        let href = attribute("href", in: tag),
        let url = URL(string: href, relativeTo: base)?.absoluteURL
      else { continue }
      if rel.contains("apple-touch-icon") { touch.append(url) } else { plain.append(url) }
    }
    return touch + plain
  }

  private static func attribute(_ name: String, in tag: String) -> String? {
    guard let regex = try? NSRegularExpression(pattern: "\\b\(name)\\s*=\\s*[\"']([^\"']*)[\"']", options: [.caseInsensitive]),
      let match = regex.firstMatch(in: tag, range: NSRange(tag.startIndex..., in: tag)),
      let range = Range(match.range(at: 1), in: tag)
    else { return nil }
    return String(tag[range])
  }
}
