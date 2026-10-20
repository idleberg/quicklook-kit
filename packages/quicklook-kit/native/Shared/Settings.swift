import Foundation

/// One entry of the `QLSettings` schema the build writes into Info.plist.
/// Compiled into both the app, which edits the values, and the extension,
/// which hands them to the page. See packages/quicklook-kit/src/config.ts.
struct SettingSpec {
  let key: String
  let type: String
  let title: String
  let description: String?
  let defaultValue: Any?
  let options: [(value: Any, label: String)]
  let radio: Bool
  let minimum: Double?
  let maximum: Double?
  let children: [SettingSpec]

  private init(_ entry: [String: Any], prefix: String) {
    let name = entry["key"] as? String ?? ""
    let type = entry["type"] as? String ?? ""
    key = prefix + name
    self.type = type
    title = entry["title"] as? String ?? words(name)
    description = entry["description"] as? String
    radio = bool(entry["radio"] as Any) ?? false
    minimum = number(entry["minimum"] as Any)?.doubleValue
    maximum = number(entry["maximum"] as Any)?.doubleValue
    children = Self.sorted(entry["properties"] as? [[String: Any]] ?? [], prefix: key + ".")
    defaultValue = entry["default"].flatMap { Self.cast($0, as: type) }
    options = (entry["enum"] as? [Any] ?? []).compactMap { option in
      let object = option as? [String: Any]
      guard let value = Self.cast(object?["value"] ?? option, as: type) else { return nil }
      return (value, object?["description"] as? String ?? "\(value)")
    }
  }

  /// Whether a stored value fits this entry: right type, in `options` if any, within bounds, integers whole.
  func isValid(_ value: Any) -> Bool { validated(value) != nil }

  /// `value` as this entry's Swift type if it fits, so a stored 3.0 comes back as integer 3.
  func validated(_ value: Any) -> Any? {
    guard let cast = Self.cast(value, as: type) else { return nil }
    if !options.isEmpty, !options.contains(where: { ($0.value as AnyObject).isEqual(cast) }) {
      return nil
    }
    if let n = number(cast)?.doubleValue {
      if let minimum, n < minimum { return nil }
      if let maximum, n > maximum { return nil }
    }
    return cast
  }

  /// `value` as Bool, String, Int or Double per `type`, or nil if it's the wrong type.
  private static func cast(_ value: Any, as type: String) -> Any? {
    switch type {
    case "boolean": bool(value)
    case "string": value as? String
    case "integer": number(value).flatMap { Int(exactly: $0.doubleValue) }
    case "number": number(value)?.doubleValue
    default: nil
    }
  }

  /// Top-level entries from the bundle's `QLSettings`, sorted; empty if absent.
  static func load(from bundle: Bundle = .main) -> [SettingSpec] {
    decode(bundle.object(forInfoDictionaryKey: "QLSettings") as? String ?? "[]")
  }

  /// Entries from a `QLSettings` JSON string, sorted; empty if it doesn't parse.
  static func decode(_ json: String) -> [SettingSpec] {
    let entries = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [[String: Any]]
    return sorted(entries ?? [], prefix: "")
  }

  /// By `order`, unordered entries last, then in declaration order.
  private static func sorted(_ entries: [[String: Any]], prefix: String) -> [SettingSpec] {
    entries.enumerated()
      .sorted {
        let a = number($0.element["order"] as Any)?.doubleValue ?? .infinity
        let b = number($1.element["order"] as Any)?.doubleValue ?? .infinity
        return (a, $0.offset) < (b, $1.offset)
      }
      .map { SettingSpec($0.element, prefix: prefix) }
  }
}

/// Defaults overridden by valid values from `defaults` (read by dotted key), as nested dictionaries.
func resolveSettings(_ specs: [SettingSpec], from defaults: UserDefaults) -> [String: Any] {
  var values: [String: Any] = [:]
  for spec in specs {
    let name = spec.key.split(separator: ".").last.map(String.init) ?? spec.key
    values[name] =
      spec.type == "object"
      ? resolveSettings(spec.children, from: defaults)
      : defaults.object(forKey: spec.key).flatMap(spec.validated) ?? spec.defaultValue
  }
  return values
}

// UserDefaults and JSONSerialization hand back NSNumber for booleans and numbers
// alike; only the CFBoolean ones are booleans.
private func bool(_ value: Any) -> Bool? {
  guard let n = value as? NSNumber, CFGetTypeID(n) == CFBooleanGetTypeID() else { return nil }
  return n.boolValue
}

private func number(_ value: Any) -> NSNumber? {
  guard let n = value as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() else { return nil }
  return n
}

/// "fontSize" → "Font Size"; dashes and underscores become spaces too.
private func words(_ key: String) -> String {
  var spaced = ""
  var previous: Character?
  for c in key {
    if c == "_" || c == "-" {
      spaced.append(" ")
    } else {
      if c.isUppercase, previous?.isLowercase == true || previous?.isNumber == true {
        spaced.append(" ")
      }
      spaced.append(c)
    }
    previous = c
  }
  return spaced.split(separator: " ").map { $0.prefix(1).uppercased() + $0.dropFirst() }
    .joined(separator: " ")
}
