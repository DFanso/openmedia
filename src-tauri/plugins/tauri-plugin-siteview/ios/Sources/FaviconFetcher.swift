import UIKit

private final class FaviconRedirects: NSObject, URLSessionTaskDelegate {
  let scope: String

  init(scope: String) { self.scope = scope }

  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    let allowed = request.url.map {
      ["http", "https"].contains($0.scheme ?? "")
        && DomainScope.registrableDomain(of: $0.host ?? "") == scope
    } ?? false
    completionHandler(allowed ? request : nil)
  }
}

/// Fetches a site's icon from the site itself and returns it as a small PNG `data:` URL.
/// Nothing goes through a third-party icon service; the only host contacted is the page's own.
enum FaviconFetcher {
  private static let maxBytes = 400_000
  private static let maxCandidates = 6
  private static let outputSize = CGSize(width: 96, height: 96)

  static func fetch(for page: URL) async -> String? {
    let scope = DomainScope.registrableDomain(of: page.host ?? "")
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpShouldSetCookies = false
    let session = URLSession(configuration: configuration, delegate: FaviconRedirects(scope: scope), delegateQueue: nil)
    defer { session.invalidateAndCancel() }
    var candidates: [URL] = []
    if let data = await get(page, using: session, scope: scope) {
      let html = String(decoding: data, as: UTF8.self)
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
      if let data = await get(url, using: session, scope: scope),
        data.count > 100, let image = UIImage(data: data),
        image.size.width <= 4096, image.size.height <= 4096
      {
        let png = UIGraphicsImageRenderer(size: outputSize).pngData { _ in
          image.draw(in: CGRect(origin: .zero, size: outputSize))
        }
        return "data:image/png;base64," + png.base64EncodedString()
      }
    }
    return nil
  }

  private static func get(_ url: URL, using session: URLSession, scope: String) async -> Data? {
    guard ["http", "https"].contains(url.scheme ?? ""),
      DomainScope.registrableDomain(of: url.host ?? "") == scope
    else { return nil }
    var request = URLRequest(url: url)
    request.timeoutInterval = 8
    do {
      let (bytes, response) = try await session.bytes(for: request)
      guard (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
      var data = Data()
      for try await byte in bytes {
        guard data.count < maxBytes else { return nil }
        data.append(byte)
      }
      return data
    } catch {
      return nil
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
