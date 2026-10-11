// Loads quicklook.config.* (any format c12 reads: ts, js, json, yaml, toml…)
// and resolves its framework and integrations.

import { join } from 'node:path';
import process from 'node:process';
import { loadConfig as loadC12 } from 'c12';
import { createJiti } from 'jiti';
import type { Plugin } from 'vite';

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

export interface QuickLookConfig {
	/** App name, shown in Finder and System Settings. */
	name: string;
	bundleId: string;
	/** Minimum macOS version. Defaults to 14.0. */
	macOS?: string;
	types: FileType[];
	/** `sveltekit`, `astro`, `solid-start`, `nuxt`, `analog`, or any integration that sets `build`. */
	framework: IntegrationRef;
	integrations?: IntegrationRef[];
	/** Directives given here replace the defaults of the same name. */
	csp?: Csp;
	/** Larger files get QuickLook's generic preview. Defaults to 10 MB. */
	maxFileSize?: number;
	/** Exposed to the page as `config.public` from `virtual:quicklook`. */
	public?: Record<string, unknown>;
}

/** What the page sees as `config` from `virtual:quicklook`. */
export type PageConfig = Pick<ResolvedConfig, 'name' | 'bundleId' | 'types' | 'public'>;

export interface ResolvedConfig
	extends Required<Omit<QuickLookConfig, 'framework' | 'integrations'>> {
	root: string;
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

export async function loadConfig(root = process.cwd()): Promise<ResolvedConfig> {
	const { config } = await loadC12<QuickLookConfig>({ name: 'quicklook', cwd: root });
	if (!config?.name) {
		throw new Error(`No quicklook.config.* with a name found in ${root}`);
	}
	const { framework: frameworkRef, integrations: refs = [], ...rest } = config;
	const framework = await resolveIntegration(frameworkRef, root);
	if (!framework.build) {
		throw new Error(`Framework "${framework.name}" doesn't say how to build the page`);
	}
	const integrations = [framework];
	for (const ref of refs) {
		integrations.push(await resolveIntegration(ref, root));
	}

	const resolved: ResolvedConfig = {
		macOS: '14.0',
		maxFileSize: 10_000_000,
		public: {},
		...rest,
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
