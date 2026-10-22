# quicklook-kit

![License](https://img.shields.io/npm/l/quicklook-kit?style=for-the-badge)
[![Version](https://img.shields.io/npm/v/quicklook-kit?style=for-the-badge)](https://www.npmjs.org/package/quicklook-kit)
[![Build](https://img.shields.io/github/actions/workflow/status/idleberg/quicklook-kit/ci.yml?style=for-the-badge)](https://github.com/idleberg/quicklook-kit/actions)

> Build macOS Quick Look previews with any Vite-based web framework, no Swift required

Your preview is a web page. quicklook-kit builds it with your framework, wraps it in a small native Quick Look extension and installs the resulting app. You never touch Swift or Xcode.

Built-in support for SvelteKit, Astro, SolidStart, Nuxt and Analog. Any other framework that builds with Vite and writes a static `index.html` works through an integration.

## Requirements

- macOS 14 or later, with [Xcode](https://apps.apple.com/app/xcode/id497799835) installed
- [XcodeGen](https://github.com/yonaskolb/XcodeGen)
- [Node.js](https://nodejs.org) 22.17 or later, which runs the `quicklook` CLI

## Installation

```sh
npm install --save-dev quicklook-kit
```

To start from scratch, run `pnpm create quicklook` instead.

## Setup

### 1. Configure

Create `quicklook.config.ts` in your project root:

```ts
import { defineConfig } from "quicklook-kit";

export default defineConfig({
  name: "Quick Look Example",
  macos: {
    bundleId: "com.example.QuickLookExample",
    types: [
      {
        id: "com.example.QuickLookExample.example",
        description: "Example File",
        extensions: ["example"],
        conformsTo: ["public.plain-text"],
      },
    ],
  },
  framework: "sveltekit",
});
```

A new type conforms to `public.plain-text` for text formats, or `public.data` for binary ones. To preview a type macOS already knows about, use a plain string like `'public.json'` in place of an object.

The config can also be `quicklook.config.js`, `.json`, `.yaml` or `.toml`, or a `.quicklookrc`. The keys are the same in every format.

| Key            | Default      |                                                                                    |
| -------------- | ------------ | ---------------------------------------------------------------------------------- |
| `name`         | required     | App name, shown in Finder and System Settings                                      |
| `macos`        | required     | macOS options, see below                                                           |
| `framework`    | required     | `'sveltekit'`, `'astro'`, `'solid-start'`, `'nuxt'`, `'analog'`, or an integration |
| `integrations` | `[]`         | See [Integrations](#integrations)                                                  |
| `csp`          | locked down  | Directives here replace the defaults of the same name                              |
| `maxFileSize`  | `10_000_000` | Larger files get Quick Look's generic preview                                      |
| `public`       | `{}`         | Values the page can read at build time                                             |
| `settings`     | `{}`         | Settings the user edits in the app, see [Settings](#settings)                      |
| `devFile`      | none         | A file the dev server previews until you drop another, relative to the project     |

Under `macos`:

| Key              | Default  |                                           |
| ---------------- | -------- | ----------------------------------------- |
| `bundleId`       | required | The extension gets `<bundleId>.Extension` |
| `types`          | required | File types to preview                     |
| `icon`           | none     | Path to an `.icns` file for the app       |
| `minimumVersion` | `'14.0'` | Minimum macOS version                     |

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

const file = nativeFile(); // the previewed file inside Quick Look, undefined in the browser
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
| `quicklook build`      | Builds the app with its extension into `.quicklook/build/macos`     |
| `quicklook register`   | Copies the built app to `/Applications` and registers the extension |
| `quicklook unregister` | Removes the app from `/Applications`                                |

After `register`, select a file in Finder and press Space. Run `build` and `register` again after every change.

If the preview doesn't show up, check `pluginkit -mAv | grep <your macos.bundleId>`, and make sure no other app claims the same file type.

Add `.quicklook` to your `.gitignore`.

## Things to know

- **Nothing can be loaded from the network.** The extension serves your build from inside the app with a strict Content Security Policy. Import images, fonts and CSS normally and they get bundled. The dev server only reports violations in the console, without blocking them.
- **Inline scripts are allowed by hash.** Frameworks that bootstrap with inline `<script>` tags keep working; the hashes are added to the CSP at build time.
- **Test in Safari.** It uses the same WebKit engine as Quick Look's WKWebView.
- **The light/dark theme follows the system.** Use `prefers-color-scheme` in CSS.
- **The app is signed ad hoc.** Other people have to allow it in System Settings → Privacy & Security on first launch. Distributing it without that step requires an Apple Developer account and notarization.

## Settings

`settings` declares options the user can change in the app. Each entry's `type` picks the control the app shows:

```ts
settings: {
  theme: {
    type: "string",
    default: "light",
    enum: [{ value: "light", description: "Light" }, "dark"],
    radio: true,
  },
  wrap: { type: "boolean", default: true, description: "Wrap **long** lines" },
  fontSize: { type: "integer", default: 13, minimum: 9, maximum: 32 },
  editor: {
    type: "object",
    properties: { tabSize: { type: "integer", default: 2, enum: [2, 4, 8] } },
  },
},
```

| Type                                        | Control                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `boolean`                                   | Checkbox                                                                  |
| `enum` (on `string`, `integer` or `number`) | Picker, or radio buttons with `radio: true`                               |
| `string`                                    | Text field                                                                |
| `integer`, `number`                         | Number field, clamped to `minimum`/`maximum`; `integer` rejects fractions |
| `object`                                    | A group with a heading, for nested `properties`                           |

Every entry except `object` needs a `default`. `title` defaults to the key in words (`fontSize` becomes "Font Size"), `description` is inline Markdown, and `order` sorts entries. `enum` entries are plain values or `{ value, description }`. A schema with an unknown type or field, a field on the wrong type, a key containing `.`, or a default that doesn't fit its type, `enum` or bounds fails the build with the key path, e.g. `settings.editor.tabSize: default 0 is below minimum 1`.

The page reads the values, nested like the schema, with `settings()`:

```ts
import { settings } from "virtual:quicklook";

const { wrap, editor } = settings();
```

In the dev server, `settings()` returns the defaults.

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
      spec.targets.QuickLookExampleExtension.info.properties.MyKey = options.key;
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
	build: {
		dev: ['vite', 'dev'],
		command: ['vite', 'build'],
		outDir: 'dist'
	}
}
```

The commands run with the project's own binaries.

## License

This work is licensed under [The MIT License](https://opensource.org/licenses/MIT).
