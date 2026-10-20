import SwiftUI
import UniformTypeIdentifiers

/// Quick Look extensions have to ship inside an app, and macOS registers them
/// when that app is first launched. Beyond that, the app only lets the user
/// enable or disable the extension.
@main
struct HostApp: App {
  private let name = Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String ?? ""

  private let specs = SettingSpec.load()

  var body: some Scene {
    Window(name, id: "main") {
      if specs.isEmpty {
        ContentView(name: name)
          .padding(32)
          .fixedSize()
      } else {
        TabView {
          ContentView(name: name)
            .padding(32)
            .tabItem { Text("General") }
          ScrollView {
            VStack(alignment: .leading, spacing: 20) {
              ForEach(specs, id: \.key) { SettingRow(spec: $0) }
            }
            .frame(width: 360, alignment: .leading)
            .padding(32)
          }
          // Caps the window height; longer forms scroll.
          .frame(maxHeight: 480)
          .tabItem { Text("Settings") }
        }
        .padding(20)
        .fixedSize()
      }
    }
    .windowResizability(.contentSize)
  }
}

/// One entry of the settings form, in a single column: title, description, control.
/// Values live in `UserDefaults.standard` under the dotted key, where the extension reads them.
private struct SettingRow: View {
  let spec: SettingSpec

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      if spec.type == "boolean" {
        CheckboxSetting(spec: spec)
        SettingDescription(spec: spec)
      } else {
        Text(spec.title).font(spec.type == "object" ? .headline : .body).bold()
        SettingDescription(spec: spec)
        if spec.type == "object" {
          VStack(alignment: .leading, spacing: 16) {
            ForEach(spec.children, id: \.key) { SettingRow(spec: $0) }
          }
          .padding(.leading, 16)
          .padding(.top, 6)
        } else if !spec.options.isEmpty {
          PickerSetting(spec: spec)
        } else {
          FieldSetting(spec: spec)
        }
      }
    }
  }
}

private struct SettingDescription: View {
  let spec: SettingSpec

  var body: some View {
    if let description = spec.description {
      let options = AttributedString.MarkdownParsingOptions(
        interpretedSyntax: .inlineOnlyPreservingWhitespace)
      Text(
        (try? AttributedString(markdown: description, options: options))
          ?? AttributedString(description)
      )
      .foregroundStyle(.secondary)
      .fixedSize(horizontal: false, vertical: true)
    }
  }
}

private struct CheckboxSetting: View {
  let spec: SettingSpec
  @State private var isOn: Bool

  init(spec: SettingSpec) {
    self.spec = spec
    _isOn = State(initialValue: (storedValue(spec) ?? spec.defaultValue) as? Bool ?? false)
  }

  var body: some View {
    Toggle(isOn: $isOn) { Text(spec.title).bold() }
      .toggleStyle(.checkbox)
      .onChange(of: isOn) { save(isOn, for: spec) }
  }
}

private struct PickerSetting: View {
  let spec: SettingSpec
  @State private var selection: Int

  init(spec: SettingSpec) {
    self.spec = spec
    let current = storedValue(spec) ?? spec.defaultValue
    _selection = State(
      initialValue: spec.options.firstIndex { option in
        current.map { same(option.value, $0) } ?? false
      } ?? 0)
  }

  var body: some View {
    let picker = Picker(spec.title, selection: $selection) {
      ForEach(spec.options.indices, id: \.self) { Text(spec.options[$0].label).tag($0) }
    }
    .labelsHidden()
    .fixedSize()
    .onChange(of: selection) { save(spec.options[selection].value, for: spec) }

    if spec.radio {
      picker.pickerStyle(.radioGroup)
    } else {
      picker.pickerStyle(.menu)
    }
  }
}

/// Saves on Return or focus loss. Empty removes the stored value, so the default
/// (shown as placeholder) applies again.
private struct FieldSetting: View {
  let spec: SettingSpec
  @State private var text: String
  @FocusState private var isFocused: Bool

  init(spec: SettingSpec) {
    self.spec = spec
    _text = State(initialValue: storedValue(spec).map { "\($0)" } ?? "")
  }

  var body: some View {
    TextField(spec.defaultValue.map { String(describing: $0) } ?? "", text: $text)
      .focused($isFocused)
      .onSubmit(commit)
      .onChange(of: isFocused) { if !isFocused { commit() } }
  }

  private func commit() {
    let input = spec.type == "string" ? text : text.trimmingCharacters(in: .whitespaces)
    if input.isEmpty {
      text = ""
      save(nil, for: spec)
      return
    }

    let clamp = { (raw: Double) in
      min(max(raw, spec.minimum ?? -.infinity), spec.maximum ?? .infinity)
    }
    var value: Any?
    switch spec.type {
    // Int() rejects fractions, so "2.5" never saves for an integer.
    case "integer":
      value = Int(input).map { clamp(Double($0)) == Double($0) ? $0 : Int(clamp(Double($0))) }
    case "number": value = Double(input).map(clamp)
    default: value = input
    }

    // Invalid input isn't saved; the field goes back to what's stored.
    guard let value, spec.isValid(value) else {
      text = storedValue(spec).map { "\($0)" } ?? ""
      return
    }
    text = "\(value)"
    save(value, for: spec)
  }
}

/// The stored value, or nil when there is none or it no longer fits the schema.
private func storedValue(_ spec: SettingSpec) -> Any? {
  guard let value = UserDefaults.standard.object(forKey: spec.key), spec.isValid(value) else {
    return nil
  }
  return value
}

/// Compares through NSObject, so an Int option matches the NSNumber UserDefaults returns,
/// and 2 matches 2.0.
private func same(_ lhs: Any, _ rhs: Any) -> Bool {
  (lhs as AnyObject).isEqual(rhs as AnyObject)
}

/// Writes or removes (nil) the value, then resets Quick Look's cache so the next
/// preview picks it up. Open previews don't update.
private func save(_ value: Any?, for spec: SettingSpec) {
  let defaults = UserDefaults.standard
  let old = defaults.object(forKey: spec.key)
  if let value {
    if let old, same(old, value) { return }
    defaults.set(value, forKey: spec.key)
  } else {
    if old == nil { return }
    defaults.removeObject(forKey: spec.key)
  }

  let process = Process()
  process.executableURL = URL(fileURLWithPath: "/usr/bin/qlmanage")
  process.arguments = ["-r", "cache"]
  process.standardOutput = FileHandle.nullDevice
  try? process.run()
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

      Divider()

      Text("Made with [quicklook-kit](https://github.com/idleberg/quicklook-kit)")
        .font(.caption)
        .foregroundStyle(.tertiary)
        .tint(.secondary)
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
