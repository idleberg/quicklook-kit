# quicklook-template-sveltekit

> Build a macOS QuickLook preview with SvelteKit, no Swift required

Your preview is a Svelte page. A small native wrapper hands it the file that QuickLook wants to show, and you never have to touch the wrapper.

## Requirements

- macOS 14 or later, with [Xcode](https://apps.apple.com/app/xcode/id497799835) installed
- [mise](https://mise.jdx.dev), which installs Bun and XcodeGen. Installing both yourself works too.

```sh
mise install
bun install
```

## 1. Describe your file type

Edit the `quicklook` block in `package.json`:

```jsonc
"quicklook": {
  "name": "Example Preview",            // app name, shown in Finder and System Settings
  "bundleId": "com.example.ExamplePreview",
  "macOS": "14.0",                      // minimum macOS version
  "types": [
    {
      "id": "com.example.ExamplePreview.example",
      "description": "Example File",
      "extensions": ["example"],
      "conformsTo": ["public.plain-text"]  // or "public.data" for binary formats
    }
  ]
}
```

To preview a type macOS already knows about, use a plain string like `"public.json"` in place of an object.

## 2. Write the preview

Your code goes in `src/lib/Viewer.svelte`. It receives `file`, which has these fields:

| Field       | Type         |                                |
| ----------- | ------------ | ------------------------------ |
| `name`      | `string`     | `"notes.example"`              |
| `extension` | `string`     | `"example"`, lowercase, no dot |
| `bytes`     | `Uint8Array` | the raw file contents          |

Decode `bytes` however your format needs: `new TextDecoder().decode(file.bytes)` for text, or a parser for binary formats.

```sh
bun dev
```

This opens the preview in your browser. Drop a file on the page to see it rendered.

Things to know:

- **Everything ends up in one HTML file.** Import images, fonts and CSS normally and they get inlined. Nothing can be loaded from the network.
- **The light/dark theme follows the system.** Use `prefers-color-scheme` in CSS.
- **Files over 10 MB** get QuickLook's generic icon preview in place of yours.

## 3. Try it in QuickLook

```sh
bun run register
```

This builds the app, copies it to `/Applications` and launches it once, which is how macOS picks up the preview. After that, select a file in Finder and press Space.

Run it again after every change. `bun run unregister` removes the app.

If the preview doesn't show up, check `pluginkit -mAv | grep <your bundleId>`, and make sure no other app claims the same file type.

## Releasing

Push a tag like `v1.0.0`. The workflow in `.github/workflows/release.yml` builds a universal app and attaches it to a GitHub release as a zip.

The app is signed ad hoc, so other people have to allow it in System Settings → Privacy & Security on first launch. Distributing it without that step requires an Apple Developer account and notarization, which this template doesn't cover.

## License

This work is licensed under the [Apache License, Version 2.0](LICENSE-APACHE) or [The MIT License](LICENSE-MIT).
