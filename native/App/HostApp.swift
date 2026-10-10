import SwiftUI

/// QuickLook extensions have to ship inside an app, and macOS registers them
/// when that app is first launched. This is all the app does.
@main
struct HostApp: App {
  private let name = Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String ?? ""

  var body: some Scene {
    Window(name, id: "main") {
      VStack(spacing: 8) {
        Text(name).font(.headline)
        Text("The QuickLook preview is installed. You can close this window.")
          .foregroundStyle(.secondary)
      }
      .padding(32)
      .fixedSize()
    }
    .windowResizability(.contentSize)
  }
}
