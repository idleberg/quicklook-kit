#!/usr/bin/env node
// Builds the page with the configured framework, wraps it in a Quick Look
// extension, and installs it. Usage: quicklook dev|build:web|build|register|unregister
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, glob, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
	addSources,
	type DeclaredType,
	loadConfig,
	type Setting,
	serializeCsp,
	type XcodeSpec,
} from './config.ts';

const config = await loadConfig();
const { root, name, framework } = config;
const target = name.replace(/[^A-Za-z0-9]/g, '');
// Everything generated lives here, away from the framework's own output.
const work = `${root}/.quicklook`;
const web = `${work}/web`;
const built = `${work}/build/${name}.app`;
const installed = `/Applications/${name}.app`;
const native = fileURLToPath(new URL('../native', import.meta.url));
const lsregister =
	'/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

const leadingV = /^v/;
const inlineScript = /<script\b(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;

/**
 * The settings schema as nested arrays, each entry with its own `key`: Swift's
 * JSONSerialization decodes objects into unordered dictionaries.
 */
function settingsSchema(settings: Record<string, Setting>): object[] {
	return Object.entries(settings).map(([key, setting]) =>
		setting.type === 'object'
			? { ...setting, key, properties: settingsSchema(setting.properties) }
			: { ...setting, key },
	);
}

/** Runs a command, exiting with its status if it fails unless `nothrow` is set. */
function exec(
	[file = '', ...args]: string[],
	{ quiet = false, nothrow = false, env = process.env } = {},
) {
	const { status, error } = spawnSync(file, args, {
		cwd: root,
		env,
		stdio: quiet ? 'ignore' : 'inherit',
	});
	if (error) {
		throw error;
	}
	if (status !== 0 && !nothrow) {
		process.exit(status ?? 1);
	}
}

/** `node_modules/.bin` of the project and every folder above it, as workspaces hoist binaries. */
function binPath() {
	const dirs: string[] = [];
	for (let dir = root; ; dir = dirname(dir)) {
		dirs.push(join(dir, 'node_modules/.bin'));
		if (dir === dirname(dir)) {
			return [...dirs, process.env.PATH].join(delimiter);
		}
	}
}

/** Runs a framework command with the project's own binaries. */
function run(command: string[]) {
	exec(command, { env: { ...process.env, PATH: binPath() } });
}

/** Frameworks bootstrap with inline scripts; the CSP allows exactly those, by hash. */
async function inlineScriptHashes() {
	const hashes = new Set<string>();
	for await (const file of glob('**/*.html', { cwd: web })) {
		const html = await readFile(`${web}/${file}`, 'utf8');
		for (const [, body = ''] of html.matchAll(inlineScript)) {
			hashes.add(`'sha256-${createHash('sha256').update(body).digest('base64')}'`);
		}
	}
	return [...hashes];
}

/** Builds the page with the framework and copies it to `.quicklook/web`. */
async function buildWeb() {
	run(framework.build.command);
	const outDir = resolve(root, framework.build.outDir);
	for (const integration of config.integrations) {
		await integration.hooks?.['build:done']?.({ outDir, config });
	}
	// Copied so the bundle's folder is always named `web`, whatever the framework calls it.
	await rm(web, { recursive: true, force: true });
	await cp(outDir, web, { recursive: true });
}

function macos() {
	if (!config.macos) {
		throw new Error(
			'quicklook.config has no "macos" group, so there is nothing to build for macOS.',
		);
	}
	return config.macos;
}

async function build() {
	const { bundleId, minimumVersion, types, icon } = macos();
	await buildWeb();

	const csp = addSources(config.csp, 'script-src', ...(await inlineScriptHashes()));
	const hasSettings = Object.keys(config.settings).length > 0;
	// Read by native/Shared/Settings.swift. A string, so plist types can't coerce it.
	const qlSettings = hasSettings && { QLSettings: JSON.stringify(settingsSchema(config.settings)) };
	const spec: XcodeSpec = {
		name: target,
		// No createIntermediateGroups: with the kit linked from outside the project,
		// it roots groups at their common ancestor and breaks the icon's path.
		options: { deploymentTarget: { macOS: minimumVersion } },
		settings: {
			base: {
				SWIFT_VERSION: '6.0',
				MARKETING_VERSION: process.env.VERSION?.replace(leadingV, '') ?? '1.0',
				CURRENT_PROJECT_VERSION: '1',
				// Ad-hoc signing: enough for Quick Look to load it, no Apple Developer account needed.
				CODE_SIGN_STYLE: 'Manual',
				CODE_SIGN_IDENTITY: '-',
			},
		},
		targets: {
			[target]: {
				type: 'application',
				platform: 'macOS',
				sources: [
					`${native}/App`,
					`${native}/Shared`,
					...(icon ? [{ path: resolve(root, icon), buildPhase: 'resources' }] : []),
				],
				settings: { PRODUCT_NAME: name, PRODUCT_BUNDLE_IDENTIFIER: bundleId },
				dependencies: [{ target: `${target}Extension`, embed: true, codeSign: true }],
				info: {
					path: `${work}/App/Info.plist`,
					properties: {
						CFBundleName: name,
						...(icon && { CFBundleIconFile: basename(icon, '.icns') }),
						LSMinimumSystemVersion: minimumVersion,
						...qlSettings,
						UTExportedTypeDeclarations: types
							.filter((type): type is DeclaredType => typeof type !== 'string')
							.map((type) => ({
								UTTypeIdentifier: type.id,
								UTTypeDescription: type.description,
								UTTypeConformsTo: type.conformsTo,
								UTTypeTagSpecification: { 'public.filename-extension': type.extensions },
							})),
					},
				},
			},
			[`${target}Extension`]: {
				type: 'app-extension',
				platform: 'macOS',
				sources: [
					`${native}/Extension`,
					`${native}/Shared`,
					{ path: web, type: 'folder', buildPhase: 'resources' },
				],
				// macOS silently ignores an extension whose bundle id isn't prefixed by its app's.
				settings: { PRODUCT_BUNDLE_IDENTIFIER: `${bundleId}.Extension` },
				dependencies: [{ sdk: 'QuickLookUI.framework' }, { sdk: 'WebKit.framework' }],
				entitlements: {
					path: `${work}/Extension/Extension.entitlements`,
					properties: {
						'com.apple.security.app-sandbox': true,
						'com.apple.security.files.user-selected.read-only': true,
						// WKWebView's content process won't launch in a sandbox without this,
						// even for a page that loads nothing. The page's CSP blocks all requests.
						'com.apple.security.network.client': true,
						// Lets the sandboxed extension read the settings the app saves to its UserDefaults.standard.
						...(hasSettings && {
							'com.apple.security.temporary-exception.shared-preference.read-only': [bundleId],
						}),
					},
				},
				info: {
					path: `${work}/Extension/Info.plist`,
					properties: {
						CFBundleDisplayName: name,
						// Read by PreviewViewController.swift.
						QLWebContentSecurityPolicy: serializeCsp(csp),
						QLMaxFileSize: config.maxFileSize,
						...qlSettings,
						NSExtension: {
							NSExtensionPointIdentifier: 'com.apple.quicklook.preview',
							NSExtensionPrincipalClass: 'PreviewViewController',
							NSExtensionAttributes: {
								QLSupportedContentTypes: types.map((type) =>
									typeof type === 'string' ? type : type.id,
								),
								QLSupportsSearchableItems: false,
							},
						},
					},
				},
			},
		},
	};
	for (const integration of config.integrations) {
		await integration.hooks?.['xcode:spec']?.(spec, config);
	}

	// JSON is valid YAML.
	await writeFile(`${work}/project.yml`, JSON.stringify(spec, null, 2));
	exec(['xcodegen', 'generate', '--quiet', '--spec', `${work}/project.yml`, '--project', work]);
	exec([
		'xcodebuild',
		'-quiet',
		'-project',
		`${work}/${target}.xcodeproj`,
		'-scheme',
		target,
		'-configuration',
		'Release',
		'-destination',
		'generic/platform=macOS',
		`CONFIGURATION_BUILD_DIR=${work}/build`,
		'build',
	]);
	// Finder keys its icon cache on the bundle's mtime, which xcodebuild leaves alone.
	exec(['touch', built]);
	console.log(`Built ${built}`);
}

switch (process.argv[2]) {
	case 'dev':
		run(framework.build.dev);
		break;

	case 'build:web':
		await buildWeb();
		break;

	case 'build':
		await build();
		break;

	// macOS only loads extensions from apps in a standard location, and caches
	// registrations aggressively, including for apps since renamed or deleted.
	case 'register':
		if (!existsSync(built)) {
			throw new Error(`No build at ${built}, run 'quicklook build' first.`);
		}
		await rm(installed, { recursive: true, force: true });
		exec(['cp', '-R', built, installed]);
		exec([lsregister, '-f', '-R', installed]);
		exec(['qlmanage', '-r'], { quiet: true, nothrow: true });
		exec(['qlmanage', '-r', 'cache'], { quiet: true, nothrow: true });
		// Launching the app is what registers its embedded extension.
		exec(['open', '-g', installed]);
		console.log(`Installed ${installed}\nVerify with: pluginkit -mAv | grep ${macos().bundleId}`);
		break;

	case 'unregister':
		exec([lsregister, '-u', installed], { quiet: true, nothrow: true });
		await rm(installed, { recursive: true, force: true });
		exec(['qlmanage', '-r'], { quiet: true, nothrow: true });
		console.log(`Removed ${installed}`);
		break;

	default:
		throw new Error('Usage: quicklook dev|build:web|build|register|unregister');
}
