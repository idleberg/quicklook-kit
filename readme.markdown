# quicklook-kit

[![Build](https://img.shields.io/github/actions/workflow/status/idleberg/quicklook-kit/ci.yml?style=for-the-badge)](https://github.com/idleberg/quicklook-kit/actions)

> Build macOS QuickLook previews with any Vite-based web framework.

Your preview is a web page. A small native wrapper hands it the file QuickLook wants to show, and you never have to touch the wrapper.

## Requirements

- macOS 14 or later, with [Xcode](https://apps.apple.com/app/xcode/id497799835) installed
- [mise](https://mise.jdx.dev), which installs Bun and XcodeGen. Installing both yourself works too.

```sh
mise install
```

## Layout

| Path                     |                                                         |
| ------------------------ | ------------------------------------------------------- |
| `packages/quicklook-kit` | The `quicklook` CLI, config, Vite plugin and Swift code |
| `templates/sveltekit`    | A starter preview in SvelteKit                          |
| `templates/astro`        | The same in Astro                                       |
| `templates/solid-start`  | The same in SolidStart                                  |
| `templates/nuxt`         | The same in Nuxt                                        |
| `templates/analog`       | The same in Analog (Angular)                            |
| `workflows/release.yml`  | A GitHub release workflow, see [Releasing](#releasing)  |

Pick a template and work inside its folder. All commands below run there.

## 1. Describe your file type

Edit `quicklook.config.ts`:

```ts
import { defineConfig } from "quicklook-kit";

export default defineConfig({
  name: "Example Preview",
  bundleId: "com.example.ExamplePreview",
  types: [
    {
      id: "com.example.ExamplePreview.example",
      description: "Example File",
      extensions: ["example"],
      conformsTo: ["public.plain-text"],
    },
  ],
  framework: "sveltekit",
});
```

A new type conforms to `public.plain-text` for text formats, or `public.data` for binary ones. To preview a type macOS already knows about, use a plain string like `'public.json'` in place of an object.

The config can also be `quicklook.config.js`, `.json`, `.yaml` or `.toml`, or a `.quicklookrc`. The keys are the same in every format.

See the [package readme](packages/quicklook-kit/readme.markdown#1-configure) for all options.

## 2. Write the preview

The preview reads the file from `virtual:quicklook`:

```ts
import { config, nativeFile, browserFile } from "virtual:quicklook";

const file = nativeFile(); // the previewed file inside QuickLook, undefined in the browser
config.name; // values from quicklook.config.*, including config.public
```

`file` has these fields:

| Field       | Type         |                                |
| ----------- | ------------ | ------------------------------ |
| `name`      | `string`     | `"notes.example"`              |
| `extension` | `string`     | `"example"`, lowercase, no dot |
| `bytes`     | `Uint8Array` | the raw file contents          |

Decode `bytes` however your format needs: `new TextDecoder().decode(file.bytes)` for text, or a parser for binary formats.

Each template's example viewer lives in:

- SvelteKit: `src/lib/FileViewer.svelte`
- Astro: `src/components/FileViewer.astro`
- SolidStart: `src/components/FileViewer.tsx`
- Nuxt: `app/components/FileViewer.vue`
- Analog: `src/app/file-viewer.ts`

```sh
mise run dev
```

This starts the framework's dev server. Drop a file on the page to see it rendered.

**Preview the dev server in Safari.** It uses the same WebKit engine as QuickLook's WKWebView, so it's the closest match to what the extension renders. Chrome and Firefox can differ in CSS and JS support.

Things to know:

- **Nothing can be loaded from the network.** The extension serves your build from inside the app with a strict Content Security Policy. Import images, fonts and CSS normally and they get bundled. The dev server only reports violations in the console, without blocking them, so check it there.
- **The light/dark theme follows the system.** Use `prefers-color-scheme` in CSS.
- **Files over `maxFileSize`** get QuickLook's generic icon preview in place of yours.

## 3. Try it in QuickLook

```sh
mise run register
```

This builds the app into `.quicklook/build`, copies it to `/Applications` and launches it once, which is how macOS picks up the preview. After that, select a file in Finder and press Space.

Run it again after every change. `mise run unregister` removes the app.

If the preview doesn't show up, check `pluginkit -mAv | grep <your bundleId>`, and make sure no other app claims the same file type.

## Using another framework

Any framework that builds with Vite and writes a static `index.html` works, through an integration. See [Integrations](packages/quicklook-kit/readme.markdown#integrations) in the package readme.

## Releasing

A release workflow is included in `workflows/release.yml`. It sits outside `.github` so it doesn't run in this repo. To use it, copy it to `.github/workflows/release.yml` in your project:

```sh
mkdir -p .github/workflows
cp workflows/release.yml .github/workflows/
```

Then push a tag like `v1.0.0`. The workflow builds a universal app from the project in its `PROJECT` variable and attaches it to a GitHub release as a zip.

The app is signed ad hoc, so other people have to allow it in System Settings → Privacy & Security on first launch. Distributing it without that step requires an Apple Developer account and notarization, which this template doesn't cover.

## Development

```sh
mise run dev            # dev server
mise run build:web      # build the page only
mise run build          # build the app into .quicklook/build
mise run register       # build, install to /Applications and register
mise run unregister     # remove the app
mise run check          # typecheck the package, every template and the Swift code
mise run lint           # Biome and SwiftLint
mise run format         # Biome and swift-format
```

A pre-commit hook from [hk](https://hk.jdx.dev) runs the linters and formatters with fixes on staged files.

## License

This work is licensed under [The MIT License](LICENSE).
