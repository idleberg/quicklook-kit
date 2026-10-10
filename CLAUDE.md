# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`quicklook-kit`: build macOS QuickLook preview extensions from any Vite-based web framework. A Bun workspace with the kit in `packages/quicklook-kit` and one starter per framework in `templates/*` (sveltekit, astro, solid-start, nuxt, analog), each depending on `quicklook-kit: workspace:*`. `readme.markdown` is the user-facing docs; keep it in sync when changing config keys, hooks or commands.

## Commands

Tooling comes from `mise install` (Bun, hk, swiftlint, xcodegen); its postinstall runs `bun install` and installs the hk pre-commit hook.

Project tasks run in the **current directory**, so `cd templates/<name>` first:

```sh
mise run dev          # framework dev server; drop a file on the page
mise run build:web    # page only → .quicklook/web
mise run build        # full app → .quicklook/build/<name>.app (xcodegen + xcodebuild)
mise run register     # build, copy to /Applications, lsregister, launch once
mise run unregister
```

Repo-wide (run from root):

```sh
mise run check        # tsc/svelte-check etc. in every workspace + swiftc -typecheck on native/
mise run lint         # biome lint . && swiftlint
mise run format       # biome check --write . && swift format
bun run --filter quicklook-sveltekit check   # typecheck a single workspace
```

There is no test suite. Verify changes with `check`, then `mise run register` in a template and preview a file in Finder (`pluginkit -mAv | grep <bundleId>` if it doesn't show up).

## Architecture

The pipeline crosses TS → Xcode → Swift → page JS:

1. **Config** (`src/config.ts`): `loadConfig()` reads `quicklook.config.*` via c12 (ts/js/json/yaml/toml/rc), resolves `framework` and `integrations` (built-in names from `src/frameworks/`, otherwise imported from the project with jiti), applies defaults (CSP, `macOS`, `maxFileSize`), then runs `config:resolved` hooks. The framework is just an `Integration` that must set `build: { dev, command, outDir }`; it is always first in `integrations`.
2. **CLI** (`src/cli.ts`, run by Bun as the `quicklook` bin): runs the framework's build command, runs `build:done` hooks, copies `outDir` to `.quicklook/web`, hashes inline `<script>`s into the CSP `script-src`, builds an XcodeGen spec as a JS object (app target + `<Target>Extension` target with `web/` as a resources folder), runs `xcode:spec` hooks, writes it as JSON to `.quicklook/project.yml`, then `xcodegen` + `xcodebuild`. Signing is ad hoc. The extension bundle id must be `<bundleId>.Extension` or macOS ignores it.
3. **Native** (`native/Extension/PreviewViewController.swift`): serves `web/` from the bundle over a custom `quicklook://app/` scheme (with a path-traversal guard), reads `QLWebContentSecurityPolicy`/`QLMaxFileSize` from Info.plist, and injects `window.quicklook = { name, extension, base64 }` at document start. `native/App/HostApp.swift` is the minimal host app.
4. **Page** (`src/vite.ts`, `src/runtime.ts`): the `quicklook()` Vite plugin provides `virtual:quicklook` (`config`, `nativeFile()`, `browserFile()`), adds integrations' `vite` plugins, and sets a report-only CSP on the dev server. `nativeFile()` decodes the injected base64; `browserFile()` gives the same shape for drag-and-drop in dev.

The package ships TypeScript source directly (`exports` point at `src/*.ts`); there is no build step for the kit.

Constraints that shape the code: the page runs in a sandboxed WKWebView with a strict CSP and no network (assets must be bundled); the `network.client` entitlement is still required for WebKit to start. Every framework must emit a static `index.html` (SSR off / static adapter), each template's viewer is its example preview (paths listed in the readme).

## Conventions

- Biome with the `all` preset (`biome.jsonc`); disabled rules carry a comment saying why. Follow that pattern for new exceptions. Tabs, single quotes.
- Swift 6, checked by swiftlint and `swift format lint --strict`.
- `workflows/release.yml` is a template for users and intentionally lives outside `.github` so it doesn't run here.
- `.quicklook/` and framework output dirs are generated and gitignored.
