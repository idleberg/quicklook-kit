import SwiftUI
import UniformTypeIdentifiers

/// Quick Look extensions have to ship inside an app, and macOS registers them
/// when that app is first launched. Beyond that, the app only lets the user
/// enable or disable the extension.
@main
struct HostApp: App {
  private let name = Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String ?? ""

  var body: some Scene {
    Window(name, id: "main") {
      ContentView(name: name)
        .padding(32)
        .fixedSize()
    }
    .windowResizability(.contentSize)
  }
}

private struct ContentView: View {
  let name: String

  // Matches the extension's PRODUCT_BUNDLE_IDENTIFIER in cli.ts.
  private let extensionId = "\(Bundle.main.bundleIdentifier ?? "").Extension"

  @State private var isEnabled = true
  @State private var status: String?
  @State private var conflicts: [String] = []

  var body: some View {
    VStack(spacing: 16) {
      VStack(spacing: 8) {
        Text(name).font(.headline)
        Text("Previews supported files when you press Space in Finder.")
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
      }

      Button(isEnabled ? "Disable Preview" : "Enable Preview", action: toggle)

      if let status {
        Text(status).font(.caption).foregroundStyle(.secondary)
      }

      if isEnabled && !conflicts.isEmpty {
        VStack(alignment: .leading, spacing: 8) {
          Text("⚠️ \(conflicts.count == 1 ? "There is a conflict:" : "There are conflicts:")")
            .bold()
          ForEach(conflicts, id: \.self) { conflict in
            Label {
              Text(conflict)
            } icon: {
              Text("•")
            }
            .fixedSize(horizontal: false, vertical: true)
          }
        }
        .font(.callout)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    // Fixed so the window only grows in height as text comes and goes.
    .frame(width: 360)
    .onAppear(perform: refresh)
  }

  private func refresh() {
    isEnabled = currentlyEnabled()
    // The same app installed twice yields the same line twice; ForEach needs unique ids.
    var seen = Set<String>()
    conflicts = findConflicts().filter { seen.insert($0).inserted }
  }

  /// Other apps that would win over this preview for some of its file types.
  /// ponytail: how Quick Look picks between conflicting extensions isn't documented, so
  /// this is a best guess. Any overlap is reported, even if we'd happen to win.
  private func findConflicts() -> [String] {
    var conflicts: [String] = []

    // Same file extension, two types: LaunchServices resolves the extension to only one.
    // UTIs are case-insensitive, and LaunchServices returns them lowercased.
    let declarations = Bundle.main.object(forInfoDictionaryKey: "UTExportedTypeDeclarations")
    for declaration in declarations as? [[String: Any]] ?? [] {
      guard let id = declaration["UTTypeIdentifier"] as? String,
        let tags = declaration["UTTypeTagSpecification"] as? [String: Any],
        let extensions = tags["public.filename-extension"] as? [String]
      else { continue }
      for ext in extensions {
        guard let other = UTType(filenameExtension: ext)?.identifier,
          other.lowercased() != id.lowercased()
        else { continue }
        conflicts.append("“.\(ext)” files are claimed by another app’s type “\(other)”.")
      }
    }

    // Same type, two extensions.
    let ourTypes = supportedTypes(Bundle.main.builtInPlugInsURL?.appendingPathComponent(appexName))
    guard let output = pluginkit("-m", "-v", "-p", "com.apple.quicklook.preview") else {
      return conflicts
    }
    for line in output.split(separator: "\n") {
      guard let path = line.split(separator: "\t").last.map(String.init),
        !line.trimmingCharacters(in: .whitespaces).hasPrefix("-"),
        !line.contains(" \(extensionId)("),
        !path.hasPrefix("/System/")
      else { continue }
      let theirTypes = supportedTypes(URL(fileURLWithPath: path))
      let overlaps = ourTypes.contains { ours in theirTypes.contains { ours.conforms(to: $0) } }
      guard overlaps else { continue }
      let app = path.split(separator: "/").first { $0.hasSuffix(".app") }?.dropLast(4)
      conflicts.append(
        "“\(app ?? Substring(path))” also previews these files. Turn it off in System Settings → "
          + "Login Items & Extensions → Quick Look.")
    }
    return conflicts
  }

  private var appexName: String {
    let plugins = Bundle.main.builtInPlugInsPath ?? ""
    let items = (try? FileManager.default.contentsOfDirectory(atPath: plugins)) ?? []
    return items.first { $0.hasSuffix(".appex") } ?? ""
  }

  private func supportedTypes(_ appex: URL?) -> [UTType] {
    guard let appex, let info = Bundle(url: appex)?.infoDictionary,
      let attributes = (info["NSExtension"] as? [String: Any])?["NSExtensionAttributes"]
        as? [String: Any],
      let ids = attributes["QLSupportedContentTypes"] as? [String]
    else { return [] }
    return ids.compactMap(UTType.init)
  }

  /// `pluginkit -mv` prefixes a line with `-` when the extension is ignored,
  /// `+` when explicitly enabled, and nothing when enabled by default.
  private func currentlyEnabled() -> Bool {
    guard let output = pluginkit("-m", "-v", "-i", extensionId) else { return true }
    return !output.trimmingCharacters(in: .whitespaces).hasPrefix("-")
  }

  private func toggle() {
    guard pluginkit("-e", isEnabled ? "ignore" : "use", "-i", extensionId) != nil else {
      status = "Couldn't change the preview. Try again from System Settings."
      return
    }
    refresh()
    status = isEnabled ? "Preview enabled." : "Preview disabled."
  }

  /// Returns stdout, or nil if pluginkit failed to run or exited non-zero.
  private func pluginkit(_ args: String...) -> String? {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/pluginkit")
    process.arguments = args
    let pipe = Pipe()
    process.standardOutput = pipe
    guard (try? process.run()) != nil else { return nil }
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else { return nil }
    return String(data: data, encoding: .utf8)
  }
}
