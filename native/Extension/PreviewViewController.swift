import QuickLookUI
import WebKit

/// Loads the SvelteKit build (`index.html`, bundled as a resource) and hands it
/// the previewed file as `window.quicklook`. See src/lib/quicklook.ts.
@objc(PreviewViewController)
final class PreviewViewController: NSViewController, QLPreviewingController {
  /// Larger files throw, which makes QuickLook fall back to its generic preview
  /// instead of stalling while megabytes of base64 cross into the page.
  private static let maxFileSize = 10_000_000

  private let loadWaiter = LoadWaiter()

  private lazy var webView: WKWebView = {
    let webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
    webView.navigationDelegate = loadWaiter
    return webView
  }()

  override func loadView() {
    view = webView
  }

  func preparePreviewOfFile(at url: URL) async throws {
    let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    guard size <= Self.maxFileSize else { throw CocoaError(.fileReadTooLarge) }
    guard let page = Bundle.main.url(forResource: "index", withExtension: "html") else {
      throw CocoaError(.fileNoSuchFile)
    }

    let file = [
      "name": url.lastPathComponent,
      "extension": url.pathExtension.lowercased(),
      "base64": try Data(contentsOf: url).base64EncodedString(),
    ]
    // JSON is a valid JavaScript expression, so this needs no escaping of its own.
    let json = String(decoding: try JSONSerialization.data(withJSONObject: file), as: UTF8.self)
    let scripts = webView.configuration.userContentController
    scripts.removeAllUserScripts()
    scripts.addUserScript(
      WKUserScript(
        source: "window.quicklook = \(json);", injectionTime: .atDocumentStart,
        forMainFrameOnly: true))

    // QuickLook displays the view as soon as this returns, so wait for the
    // page to actually finish loading — otherwise larger files show blank.
    try await loadWaiter.load { webView.loadFileURL(page, allowingReadAccessTo: page) }
  }
}

/// Bridges `WKNavigationDelegate` callbacks back to `async`.
@MainActor
private final class LoadWaiter: NSObject, WKNavigationDelegate {
  private var continuation: CheckedContinuation<Void, Error>?

  func load(_ start: () -> Void) async throws {
    try await withCheckedThrowingContinuation { continuation in
      self.continuation = continuation
      start()
    }
  }

  private func finish(_ result: Result<Void, Error>) {
    continuation?.resume(with: result)
    continuation = nil
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    finish(.success(()))
  }

  func webView(
    _ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error
  ) {
    finish(.failure(error))
  }

  func webView(
    _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    finish(.failure(error))
  }

  /// A crashed content process fires no navigation callback at all — without
  /// this the await never returns and QuickLook spins forever.
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    finish(.failure(CocoaError(.featureUnsupported)))
  }
}
