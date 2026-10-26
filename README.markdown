# quicklook-kit

[![Build](https://img.shields.io/github/actions/workflow/status/idleberg/quicklook-kit/ci.yml?style=for-the-badge)](https://github.com/idleberg/quicklook-kit/actions)

> Build Quick Look previews for macOS and Windows with Vite-based web frameworks.

Your preview is a web page. A small native wrapper hands it the file to show, Quick Look's on macOS or [QuickLook](https://github.com/QL-Win/QuickLook)'s on Windows, and you never have to touch the wrapper.

## Requirements

- [mise](https://mise.jdx.dev), which installs Node.js (with pnpm through corepack), XcodeGen for macOS and the .NET SDK for Windows. Installing them yourself works too.
- For macOS: macOS 14 or later, with [Xcode](https://apps.apple.com/app/xcode/id497799835) installed
- For Windows: nothing else to build, since the plugin builds on any OS. Trying it needs Windows with QuickLook and the Microsoft Edge WebView2 Runtime, which ships with Windows 11.

## Starting your own preview

```sh
pnpm create quicklook my-preview
```

It asks which framework to start from (SvelteKit, Astro, SolidStart, Nuxt, Analog or Alpine.js), which platforms to build for and whether to add a [release workflow](#releasing). Skip the questions with `--template sveltekit`, `--platform macos --platform windows` and `--release` or `--no-release`. Then:

```sh
cd my-preview
mise install
```

All commands below run in your project folder.

The project comes with [Biome](https://biomejs.dev) for linting and formatting (`pnpm lint`, `pnpm format`), a pre-commit hook from [hk](https://hk.jdx.dev) that runs it on staged files, and a CI workflow in `.github/workflows/ci.yml` that lints and typechecks every push.

## 1. Describe your file type

Edit `quicklook.config.ts`:

```ts
import { defineConfig } from 'quicklook-kit';

export default defineConfig({
	name: 'Quick Look Example',
	macos: {
		bundleId: 'com.example.QuickLookExample',
		types: [
			{
				id: 'com.example.QuickLookExample.example',
				description: 'Example File',
				extensions: ['example'],
				conformsTo: ['public.plain-text'],
			},
		],
	},
	windows: {
		id: 'QuickLook.Plugin.Example',
		extensions: ['example'],
	},
	framework: 'sveltekit',
});
```

Each platform has its own group, and a project builds for the platforms it has groups for.

On macOS, a new type conforms to `public.plain-text` for text formats, or `public.data` for binary ones. To preview a type macOS already knows about, use a plain string like `'public.json'` in place of an object. On Windows, `extensions` is all it takes, and `id` must start with `QuickLook.Plugin.`.

The config can also be `quicklook.config.js`, `.json`, `.yaml` or `.toml`, or a `.quicklookrc`. The keys are the same in every format.

See the [package readme](packages/quicklook-kit/README.markdown#1-configure) for all options.

## 2. Write the preview

The preview reads the file from `virtual:quicklook`:

```ts
import { config, nativeFile, browserFile } from 'virtual:quicklook';

const file = nativeFile(); // the previewed file, undefined in the browser
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
- Alpine.js: `src/file-viewer.ts`

```sh
pnpm dev
```

This starts the framework's dev server. Drop a file on the page to see it rendered, or set `devFile` in the config to a file it shows on start.

**Preview the dev server in Safari for macOS, and in Edge for Windows.** Quick Look renders with WebKit, like Safari, and QuickLook on Windows with WebView2, like Edge, so those are the closest matches.

Things to know:
- **Nothing can be loaded from the network.** Both platforms serve your build from disk with a strict Content Security Policy. Import images, fonts and CSS normally and they get bundled. The dev server only reports violations in the console, without blocking them, so check it there.
- **The light/dark theme follows the system.** Use `prefers-color-scheme` in CSS.
- **Files over `maxFileSize`** get the system's own preview in place of yours.

## 3. Try it

```sh
pnpm register
```

Run it again after every change. `pnpm unregister` removes the preview again.

On macOS, this builds the app into `.quicklook/build/macos`, copies it to `/Applications` and launches it once, which is how macOS picks up the preview. After that, select a file in Finder and press Space. If the preview doesn't show up, check `pluginkit -mAv | grep <your macos.bundleId>`, and make sure no other app claims the same file type.

On Windows, this builds the plugin into `.quicklook/build/windows` and copies it into QuickLook's plugin folder. Restart QuickLook, then select a file in Explorer and press Space.

`pnpm build` builds every configured platform without installing anything. The Windows plugin builds on a Mac too; the macOS app needs a Mac.

## Using another framework

Any framework that builds with Vite and writes a static `index.html` works, through an integration. See [Integrations](packages/quicklook-kit/README.markdown#integrations) in the package readme.

## Releasing

With `--release`, the project gets `.github/workflows/release.yml`. Push a tag like `v1.0.0` and it builds every configured platform and attaches `<App>-v1.0.0-macos.zip`, a universal app, and `<App>-v1.0.0-windows.qlplugin` to a GitHub release.

Windows users install the `.qlplugin` by previewing it in QuickLook and clicking the install button.

The macOS app is signed ad hoc, so other people have to allow it in System Settings → Privacy & Security on first launch. Distributing it without that step requires an Apple Developer account and notarization, which this template doesn't cover.

## Development

This repository holds both packages and the templates:

| Path                                    |                                                             |
| --------------------------------------- | ----------------------------------------------------------- |
| `packages/quicklook-kit`                | The `quicklook` CLI, config, Vite plugin, Swift and C# code |
| `packages/create-quicklook`             | `pnpm create quicklook`                                     |
| `packages/create-quicklook/templates/*` | The starter projects, linked to the local package           |

```sh
mise install            # tools, git hooks and dependencies
mise run check          # typecheck both packages, every template and the Swift code
mise run lint           # Biome and SwiftLint
mise run format         # Biome and swift-format
```

Inside a template, `pnpm dev`, `pnpm build` and `pnpm register` use the local `quicklook-kit`.

A pre-commit hook from [hk](https://hk.jdx.dev) runs the linters and formatters with fixes on staged files.

### Releasing

Add a changeset to every pull request that changes a package:

```sh
pnpm changeset
```

Both packages always release together at the same version, and the templates' `quicklook-kit` range follows along. Once merged, a "version packages" pull request collects the pending changesets. Merging that publishes to npm.

## License

This work is licensed under [The MIT License](LICENSE).
