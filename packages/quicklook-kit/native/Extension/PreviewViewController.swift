import QuickLookUI
import UniformTypeIdentifiers
import WebKit

/// Loads the bundled page over `quicklook://app/` and hands it the previewed
/// file as `window.quicklook`. See packages/quicklook-kit/src/runtime.ts.
@objc(PreviewViewController)
final class PreviewViewController: NSViewController, QLPreviewingController {
  /// Larger files throw, which makes QuickLook fall back to its generic preview
  /// instead of stalling while megabytes of base64 cross into the page.
  private static let maxFileSize =
    Bundle.main.object(forInfoDictionaryKey: "QLMaxFileSize") as? Int ?? 10_000_000

  private let loadWaiter = LoadWaiter()

  private lazy var webView: WKWebView = {
    let configuration = WKWebViewConfiguration()
    configuration.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: "quicklook")
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = loadWaiter
    return webView
  }()

  override func loadView() {
    view = webView
  }

  func preparePreviewOfFile(at url: URL) async throws {
    let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    guard size <= Self.maxFileSize else { throw CocoaError(.fileReadTooLarge) }

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
    let page = URLRequest(url: URL(string: "quicklook://app/")!)
    try await loadWaiter.load { webView.load(page) }
  }
}

/// Serves the bundled `web` folder. A real origin, unlike file://, lets any
/// framework's build load its ES modules and chunks as `'self'`, and every
/// response carries the CSP the build wrote into Info.plist.
private final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
  private let root = Bundle.main.resourceURL!.appendingPathComponent("web").standardizedFileURL
  private let csp =
    Bundle.main.object(forInfoDictionaryKey: "QLWebContentSecurityPolicy") as? String
    ?? "default-src 'none'"

  func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
    guard let url = task.request.url else {
      task.didFailWithError(URLError(.badURL))
      return
    }
    var path = url.path(percentEncoded: false)
    if path.isEmpty || path.hasSuffix("/") { path += "index.html" }
    let file = root.appendingPathComponent(path).standardizedFileURL
    // `..%2f` arrives decoded as a real `..`; never serve anything outside web/.
    let data = file.path.hasPrefix(root.path + "/") ? try? Data(contentsOf: file) : nil
    let type =
      UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
    let response = HTTPURLResponse(
      url: url, statusCode: data == nil ? 404 : 200, httpVersion: "HTTP/1.1",
      headerFields: ["Content-Type": type, "Content-Security-Policy": csp])!
    task.didReceive(response)
    task.didReceive(data ?? Data())
    task.didFinish()
  }

  func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}
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
