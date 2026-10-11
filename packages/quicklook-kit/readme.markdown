# quicklook-kit

![License](https://img.shields.io/npm/l/quicklook-kit?style=for-the-badge)
[![Version](https://img.shields.io/npm/v/quicklook-kit?style=for-the-badge)](https://www.npmjs.org/package/quicklook-kit)
[![Build](https://img.shields.io/github/actions/workflow/status/idleberg/quicklook-kit/ci.yml?style=for-the-badge)](https://github.com/idleberg/quicklook-kit/actions)

> Build macOS QuickLook previews with any Vite-based web framework, no Swift required

Your preview is a web page. quicklook-kit builds it with your framework, wraps it in a small native QuickLook extension and installs the resulting app. You never touch Swift or Xcode.

Built-in support for SvelteKit, Astro, SolidStart, Nuxt and Analog. Any other framework that builds with Vite and writes a static `index.html` works through an integration.

## Requirements

- macOS 14 or later, with [Xcode](https://apps.apple.com/app/xcode/id497799835) installed
- [XcodeGen](https://github.com/yonaskolb/XcodeGen)
- [Bun](https://bun.sh), which runs the `quicklook` CLI

## Installation

```sh
bun add --dev quicklook-kit
```

To start from scratch, use one of the [templates](https://github.com/idleberg/quicklook-kit/tree/main/templates) instead.

## Setup

### 1. Configure

Create `quicklook.config.ts` in your project root:

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

| Key            | Default      |                                                                                    |
| -------------- | ------------ | ---------------------------------------------------------------------------------- |
| `name`         | required     | App name, shown in Finder and System Settings                                      |
| `bundleId`     | required     | The extension gets `<bundleId>.Extension`                                          |
| `types`        | required     | File types to preview                                                              |
| `framework`    | required     | `'sveltekit'`, `'astro'`, `'solid-start'`, `'nuxt'`, `'analog'`, or an integration |
| `icon`         | none         | Path to an `.icns` file for the app                                                |
| `macOS`        | `'14.0'`     | Minimum macOS version                                                              |
| `integrations` | `[]`         | See [Integrations](#integrations)                                                  |
| `csp`          | locked down  | Directives here replace the defaults of the same name                              |
| `maxFileSize`  | `10_000_000` | Larger files get QuickLook's generic preview                                       |
| `public`       | `{}`         | Values the page can read at build time                                             |

A framework can take options as a `[name, options]` pair, e.g. `['sveltekit', { outDir: 'dist' }]` when your adapter writes somewhere other than the default.

Each framework needs a static, client-side build:

| Framework  | Requirement                                            |
| ---------- | ------------------------------------------------------ |
| Analog     | `@analogjs/vite-plugin-angular`                        |
| Astro      | the default `output: 'static'`                         |
| Nuxt       | `ssr: false`                                           |
| SolidStart | `ssr: false`, Nitro's `static` preset prerendering `/` |
| SvelteKit  | `@sveltejs/adapter-static`                             |

### 2. Add the Vite plugin

```ts
import { quicklook } from "quicklook-kit/vite";

// in the framework's Vite config
plugins: [quicklook()];
```

For TypeScript, add the types of the virtual module, either in a `.d.ts` file:

```ts
/// <reference types="quicklook-kit/virtual" />
```

or in `tsconfig.json` under `compilerOptions.types` as `"quicklook-kit/virtual"`.

### 3. Read the file

```ts
import { browserFile, config, nativeFile } from "virtual:quicklook";

const file = nativeFile(); // the previewed file inside QuickLook, undefined in the browser
config.public; // values from quicklook.config.*
```

| Field       | Type         |                                |
| ----------- | ------------ | ------------------------------ |
| `name`      | `string`     | `"notes.example"`              |
| `extension` | `string`     | `"example"`, lowercase, no dot |
| `bytes`     | `Uint8Array` | the raw file contents          |

Decode `bytes` however your format needs: `new TextDecoder().decode(file.bytes)` for text, or a parser for binary formats.

In the dev server, `nativeFile()` returns `undefined`. Pass a dropped or picked `File` to `browserFile()` to get the same shape.

### 4. Add scripts

```json
{
  "scripts": {
    "dev": "quicklook dev",
    "build": "quicklook build",
    "register": "quicklook build && quicklook register",
    "unregister": "quicklook unregister"
  }
}
```

## CLI

| Command                | Description                                                         |
| ---------------------- | ------------------------------------------------------------------- |
| `quicklook dev`        | Starts the framework's dev server                                   |
| `quicklook build:web`  | Builds the page only, into `.quicklook/web`                         |
| `quicklook build`      | Builds the app with its extension into `.quicklook/build`           |
| `quicklook register`   | Copies the built app to `/Applications` and registers the extension |
| `quicklook unregister` | Removes the app from `/Applications`                                |

After `register`, select a file in Finder and press Space. Run `build` and `register` again after every change.

If the preview doesn't show up, check `pluginkit -mAv | grep <your bundleId>`, and make sure no other app claims the same file type.

Add `.quicklook` to your `.gitignore`.

## Things to know

- **Nothing can be loaded from the network.** The extension serves your build from inside the app with a strict Content Security Policy. Import images, fonts and CSS normally and they get bundled. The dev server only reports violations in the console, without blocking them.
- **Inline scripts are allowed by hash.** Frameworks that bootstrap with inline `<script>` tags keep working; the hashes are added to the CSP at build time.
- **Test in Safari.** It uses the same WebKit engine as QuickLook's WKWebView.
- **The light/dark theme follows the system.** Use `prefers-color-scheme` in CSS.
- **The app is signed ad hoc.** Other people have to allow it in System Settings → Privacy & Security on first launch. Distributing it without that step requires an Apple Developer account and notarization.

## Integrations

An integration is an object with a `name` and any of these hooks. They run in order: the framework first, then each entry in `integrations`.

```ts
import type { Integration } from "quicklook-kit";

export default (options: { key: string }): Integration => ({
  name: "my-integration",
  hooks: {
    // Adjust the resolved config.
    "config:resolved"(config) {},

    // Post-process the framework's static output before it's bundled.
    async "build:done"({ outDir, config }) {},

    // Edit the generated XcodeGen spec: Info.plist keys, entitlements, targets.
    "xcode:spec"(spec, config) {
      spec.targets.ExamplePreviewExtension.info.properties.MyKey = options.key;
    },

    // Add Vite plugins wherever quicklook() is used.
    vite: () => [],
  },
});
```

Add it as an object, or by name so JSON and YAML configs can use it too. A name is imported from the project: a package or a relative path, whose default export is the integration or a function returning it.

```jsonc
{
  "integrations": ["quicklook-some-package", ["./my-integration.ts", { "key": "value" }]],
}
```

A framework is an integration with a `build` field:

```ts
framework: {
	name: 'my-framework',
	build: { dev: ['vite', 'dev'], command: ['vite', 'build'], outDir: 'dist' }
}
```

The commands run with the project's own binaries.

## License

This work is licensed under [The MIT License](https://opensource.org/licenses/MIT).
