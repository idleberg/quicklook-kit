# quicklook-kit

[![Build](https://img.shields.io/github/actions/workflow/status/idleberg/quicklook-kit/ci.yml?style=for-the-badge)](https://github.com/idleberg/quicklook-kit/actions)

> Build macOS QuickLook previews with any Vite-based web framework.

Your preview is a web page. A small native wrapper hands it the file QuickLook wants to show, and you never have to touch the wrapper.

## Requirements

- macOS 14 or later, with [Xcode](https://apps.apple.com/app/xcode/id497799835) installed
- [mise](https://mise.jdx.dev), which installs Node.js (with pnpm through corepack) and XcodeGen. Installing them yourself works too.

## Starting your own preview

```sh
pnpm create quicklook my-preview
```

It asks which framework to start from (SvelteKit, Astro, SolidStart, Nuxt or Analog) and whether to add a [release workflow](#releasing). Skip the questions with `--template sveltekit` and `--release` or `--no-release`. Then:

```sh
cd my-preview
mise install
```

All commands below run in your project folder.

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

The example viewer lives in:

- SvelteKit: `src/lib/FileViewer.svelte`
- Astro: `src/components/FileViewer.astro`
- SolidStart: `src/components/FileViewer.tsx`
- Nuxt: `app/components/FileViewer.vue`
- Analog: `src/app/file-viewer.ts`

```sh
pnpm dev
```

This starts the framework's dev server. Drop a file on the page to see it rendered.

**Preview the dev server in Safari.** It uses the same WebKit engine as QuickLook's WKWebView, so it's the closest match to what the extension renders. Chrome and Firefox can differ in CSS and JS support.

Things to know:

- **Nothing can be loaded from the network.** The extension serves your build from inside the app with a strict Content Security Policy. Import images, fonts and CSS normally and they get bundled. The dev server only reports violations in the console, without blocking them, so check it there.
- **The light/dark theme follows the system.** Use `prefers-color-scheme` in CSS.
- **Files over `maxFileSize`** get QuickLook's generic icon preview in place of yours.

## 3. Try it in QuickLook

```sh
pnpm register
```

This builds the app into `.quicklook/build`, copies it to `/Applications` and launches it once, which is how macOS picks up the preview. After that, select a file in Finder and press Space.

Run it again after every change. `pnpm unregister` removes the app.

If the preview doesn't show up, check `pluginkit -mAv | grep <your bundleId>`, and make sure no other app claims the same file type.

## Using another framework

Any framework that builds with Vite and writes a static `index.html` works, through an integration. See [Integrations](packages/quicklook-kit/readme.markdown#integrations) in the package readme.

## Releasing

With `--release`, the project gets `.github/workflows/release.yml`. Push a tag like `v1.0.0` and it builds a universal app and attaches it to a GitHub release as a zip.

The app is signed ad hoc, so other people have to allow it in System Settings → Privacy & Security on first launch. Distributing it without that step requires an Apple Developer account and notarization, which this template doesn't cover.

## Development

This repository holds both packages and the templates:

| Path                                    |                                                         |
| --------------------------------------- | ------------------------------------------------------- |
| `packages/quicklook-kit`                | The `quicklook` CLI, config, Vite plugin and Swift code |
| `packages/create-quicklook`             | `pnpm create quicklook`                                 |
| `packages/create-quicklook/templates/*` | The starter projects, linked to the local package       |

```sh
mise install            # tools, git hooks and dependencies
mise run check          # typecheck both packages, every template and the Swift code
mise run lint           # Biome and SwiftLint
mise run format         # Biome and swift-format
```

Inside a template, `pnpm dev`, `pnpm build` and `pnpm register` use the local `quicklook-kit`.

A pre-commit hook from [hk](https://hk.jdx.dev) runs the linters and formatters with fixes on staged files.

## License

This work is licensed under [The MIT License](LICENSE).
