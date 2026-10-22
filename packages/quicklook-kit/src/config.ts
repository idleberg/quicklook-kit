// Loads quicklook.config.* (any format c12 reads: ts, js, json, yaml, toml…)
// and resolves its framework and integrations.

import { join } from 'node:path';
import process from 'node:process';
import { loadConfig as loadC12 } from 'c12';
import { createJiti } from 'jiti';
import type { Plugin } from 'vite';
import { validateSettings } from './settings.ts';

/** An existing type id such as "public.json", or a new type the app declares. */
export type FileType = string | DeclaredType;

/** A file type the app declares itself, as a UTExportedTypeDeclaration. */
export interface DeclaredType {
	id: string;
	description: string;
	extensions: string[];
	conformsTo: string[];
}

/** CSP directives, e.g. `{ 'img-src': ["'self'", 'https:'] }`. */
export type Csp = Partial<Record<string, string[]>>;

/** The xcodegen project spec, written as project.yml. */
// biome-ignore lint/suspicious/noExplicitAny: hooks edit arbitrary xcodegen keys.
export type XcodeSpec = Record<string, any>;

/** An `enum` entry: a plain value, or one with a label for the picker. */
export type EnumEntry<T> = T | { value: T; description?: string };

interface BaseSetting {
	/** Defaults to the key, turned into words (`fontSize` → "Font Size"). */
	title?: string;
	/** Inline Markdown. */
	description?: string;
	order?: number;
}

/**
 * A user-editable setting. The type decides the control the app shows; the
 * page gets the resolved values from `settings()`.
 */
export type Setting =
	| (BaseSetting & { type: 'boolean'; default: boolean })
	| (BaseSetting & { type: 'string'; default: string; enum?: EnumEntry<string>[]; radio?: boolean })
	| (BaseSetting & {
			type: 'integer' | 'number';
			default: number;
			enum?: EnumEntry<number>[];
			radio?: boolean;
			minimum?: number;
			maximum?: number;
	  })
	| (BaseSetting & { type: 'object'; properties: Record<string, Setting> });

export interface Integration {
	name: string;
	/** Set by frameworks only: how to run and build the page, and where it lands. */
	build?: { dev: string[]; command: string[]; outDir: string };
	hooks?: {
		'config:resolved'?: (config: ResolvedConfig) => void | Promise<void>;
		/** Runs on the framework's static output, before it's bundled into the app. */
		'build:done'?: (context: { outDir: string; config: ResolvedConfig }) => void | Promise<void>;
		/** Edit the generated Xcode project: Info.plist keys, entitlements, targets. */
		'xcode:spec'?: (spec: XcodeSpec, config: ResolvedConfig) => void | Promise<void>;
		/** Vite plugins to add wherever the `quicklook()` Vite plugin is used. */
		vite?: () => Plugin[];
	};
}

/**
 * A built-in framework or package name, the same with options, or an
 * integration object. Names are imported from the project, so JSON and YAML
 * configs can use third-party integrations too: the module's default export is
 * either an integration or a function that takes the options and returns one.
 */
export type IntegrationRef = Integration | string | [name: string, options?: unknown];

/** Builds a Quick Look extension for macOS. */
export interface MacosConfig {
	bundleId: string;
	/** Path to the app's .icns icon, relative to the project root. */
	icon?: string;
	/** Defaults to 14.0. */
	minimumVersion?: string;
	types: FileType[];
}

/** Builds a plugin for QuickLook on Windows. */
export interface WindowsConfig {
	/** The plugin's namespace and assembly name, e.g. `QuickLook.Plugin.Example`. */
	id: string;
	/** Extensions to preview, without the dot. */
	extensions: string[];
}

export interface QuickLookConfig {
	/** App name, shown in Finder and System Settings. */
	name: string;
	macos?: MacosConfig;
	windows?: WindowsConfig;
	/** `sveltekit`, `astro`, `solid-start`, `nuxt`, `analog`, or any integration that sets `build`. */
	framework: IntegrationRef;
	integrations?: IntegrationRef[];
	/** Directives given here replace the defaults of the same name. */
	csp?: Csp;
	/** Larger files get Quick Look's generic preview. Defaults to 10 MB. */
	maxFileSize?: number;
	/** Exposed to the page as `config.public` from `virtual:quicklook`. */
	public?: Record<string, unknown>;
	/** Settings the user edits in the app, read on the page with `settings()`. */
	settings?: Record<string, Setting>;
}

/** What the page sees as `config` from `virtual:quicklook`. */
export type PageConfig = Pick<ResolvedConfig, 'name' | 'public'> & {
	macos?: Pick<MacosConfig, 'bundleId' | 'types'>;
};

export interface ResolvedConfig
	extends Required<Omit<QuickLookConfig, 'framework' | 'integrations' | 'macos' | 'windows'>>,
		Pick<QuickLookConfig, 'windows'> {
	root: string;
	macos?: MacosConfig & { minimumVersion: string };
	framework: Integration & { build: NonNullable<Integration['build']> };
	/** The framework first, then the configured integrations, in order. */
	integrations: Integration[];
}

/** The previewed file is untrusted input; nothing on the page needs the network. */
export const defaultCsp: Csp = {
	'default-src': ["'none'"],
	'script-src': ["'self'"],
	'style-src': ["'self'", "'unsafe-inline'"],
	'img-src': ["'self'", 'data:', 'blob:'],
	'font-src': ["'self'", 'data:'],
	'media-src': ["'self'", 'data:', 'blob:'],
};

export const defineConfig = (config: QuickLookConfig) => config;

export const serializeCsp = (csp: Csp) =>
	Object.entries(csp)
		.map(([directive, sources = []]) => [directive, ...sources].join(' '))
		.join('; ');

/** `csp` with `sources` appended to `directive`. */
export const addSources = (csp: Csp, directive: string, ...sources: string[]): Csp => ({
	...csp,
	[directive]: [...(csp[directive] ?? []), ...sources],
});

/**
 * Built-in frameworks: their dev and build commands, and the default `outDir`
 * of a static, client-side build. Each takes `{ outDir }` to override it.
 */
const frameworkBuilds: Record<string, [dev: string[], command: string[], outDir: string]> = {
	// @analogjs/vite-plugin-angular, writing Vite's default `dist`.
	analog: [['vite', 'dev'], ['vite', 'build'], 'dist'],
	// Astro's default `output: 'static'`.
	astro: [['astro', 'dev'], ['astro', 'build'], 'dist'],
	// `ssr: false`; `nuxt generate` writes `.output/public`.
	nuxt: [['nuxt', 'dev'], ['nuxt', 'generate'], '.output/public'],
	// `solidStart({ ssr: false })` and Nitro's static preset prerendering `/`.
	'solid-start': [['vite', 'dev'], ['vite', 'build'], '.output/public'],
	// @sveltejs/adapter-static, writing `build`.
	sveltekit: [['vite', 'dev'], ['vite', 'build'], 'build'],
};

function builtinFramework(name: string, options?: unknown): Integration | undefined {
	const builtin = frameworkBuilds[name];
	if (!builtin) {
		return;
	}
	const [dev, command, outDir] = builtin;
	return {
		name,
		build: { dev, command, outDir: (options as { outDir?: string } | undefined)?.outDir ?? outDir },
	};
}

async function resolveIntegration(ref: IntegrationRef, root: string): Promise<Integration> {
	if (typeof ref === 'object' && !Array.isArray(ref)) {
		return ref;
	}
	const [name, options] = typeof ref === 'string' ? [ref] : ref;
	const builtin = builtinFramework(name, options);
	if (builtin) {
		return builtin;
	}
	const exported = await createJiti(join(root, 'quicklook.config')).import<
		Integration | ((options?: unknown) => Integration)
	>(name, { default: true });
	return typeof exported === 'function' ? exported(options) : exported;
}

/** Top-level fields from before the platform groups, and where they went. */
const movedFields: Record<string, string> = {
	bundleId: 'macos.bundleId',
	icon: 'macos.icon',
	macOS: 'macos.minimumVersion',
	types: 'macos.types, Windows uses windows.extensions',
};

const windowsId = /^QuickLook\.Plugin\.[A-Za-z0-9_.]+$/;

function validatePlatforms(config: QuickLookConfig): void {
	const moved = Object.keys(movedFields)
		.filter((field) => field in config)
		.map((field) => `${field}: moved to ${movedFields[field]}`);
	if (moved.length > 0) {
		throw new Error(moved.join('\n'));
	}
	if (!(config.macos || config.windows)) {
		throw new Error(
			'quicklook.config: add a "macos" or "windows" group for each platform to build for',
		);
	}
	if (!config.windows) {
		return;
	}
	const { id, extensions } = config.windows;
	if (typeof id !== 'string' || !windowsId.test(id)) {
		throw new Error(
			`windows.id: expected "QuickLook.Plugin." followed by a name, got ${JSON.stringify(id)}`,
		);
	}
	if (!Array.isArray(extensions) || extensions.length === 0) {
		throw new Error('windows.extensions: expected at least one extension');
	}
	const dotted = extensions.find((extension) => extension.startsWith('.'));
	if (dotted) {
		throw new Error(`windows.extensions: write "${dotted.slice(1)}" without the dot`);
	}
}

export async function loadConfig(root = process.cwd()): Promise<ResolvedConfig> {
	const { config } = await loadC12<QuickLookConfig>({ name: 'quicklook', cwd: root });
	if (!config?.name) {
		throw new Error(`No quicklook.config.* with a name found in ${root}`);
	}
	validatePlatforms(config);
	validateSettings(config.settings ?? {});
	const { framework: frameworkRef, integrations: refs = [], macos, ...rest } = config;
	const framework = await resolveIntegration(frameworkRef, root);
	if (!framework.build) {
		throw new Error(`Framework "${framework.name}" doesn't say how to build the page`);
	}
	const integrations = [framework];
	for (const ref of refs) {
		integrations.push(await resolveIntegration(ref, root));
	}

	const resolved: ResolvedConfig = {
		maxFileSize: 10_000_000,
		public: {},
		settings: {},
		...rest,
		...(macos && { macos: { minimumVersion: '14.0', ...macos } }),
		csp: { ...defaultCsp, ...config.csp },
		root,
		framework: { ...framework, build: framework.build },
		integrations,
	};
	for (const integration of integrations) {
		await integration.hooks?.['config:resolved']?.(resolved);
	}
	return resolved;
}
