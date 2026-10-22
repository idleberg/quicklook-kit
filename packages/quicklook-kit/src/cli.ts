#!/usr/bin/env node
// Builds the page with the configured framework, wraps it in a Quick Look
// extension or QL-Win plugin, and installs it.
// Usage: quicklook dev|build:web|build|register|unregister [--platform macos|windows]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, glob, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
	addSources,
	type DeclaredType,
	loadConfig,
	type Setting,
	serializeCsp,
	type XcodeSpec,
} from './config.ts';
import { windowsProject } from './windows.ts';

type Platform = 'macos' | 'windows';
const platforms: Platform[] = ['macos', 'windows'];

const {
	positionals: [subcommand],
	values: { platform },
} = parseArgs({ allowPositionals: true, options: { platform: { type: 'string' } } });
if (platform !== undefined && !platforms.includes(platform as Platform)) {
	throw new Error(`--platform: expected "macos" or "windows", got "${platform}"`);
}

const config = await loadConfig();
const { root, name, framework } = config;
const target = name.replace(/[^A-Za-z0-9]/g, '');
// Everything generated lives here, away from the framework's own output.
const work = `${root}/.quicklook`;
const web = `${work}/web`;
const built = `${work}/build/macos/${name}.app`;
const installed = `/Applications/${name}.app`;
const version = process.env.VERSION?.replace(/^v/, '') ?? '1.0';
const onWindows = process.platform === 'win32';
const native = fileURLToPath(new URL('../native', import.meta.url));
const lsregister =
	'/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

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
	{ quiet = false, nothrow = false, env = process.env, cwd = root, shell = false } = {},
) {
	const { status, error } = spawnSync(file, args, {
		cwd,
		env,
		shell,
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

/** Runs a framework command with the project's own binaries, which are `.cmd` shims on Windows. */
function run(command: string[]) {
	exec(onWindows ? [command.join(' ')] : command, {
		env: { ...process.env, PATH: binPath() },
		shell: onWindows,
	});
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

function group<P extends Platform>(key: P) {
	const options = config[key];
	if (!options) {
		throw new Error(`quicklook.config has no "${key}" group, so there is nothing to build for it.`);
	}
	return options as NonNullable<(typeof config)[P]>;
}

/** Builds every configured platform, or just `--platform`. */
async function build() {
	const targets = platform ? [platform as Platform] : platforms.filter((p) => config[p]);
	targets.forEach(group);
	if (targets.includes('macos') && process.platform !== 'darwin') {
		if (platform) {
			throw new Error('Building for macOS needs a Mac.');
		}
		console.log('Skipping macOS, which only builds on a Mac.');
		targets.splice(targets.indexOf('macos'), 1);
	}
	await buildWeb();
	const csp = addSources(config.csp, 'script-src', ...(await inlineScriptHashes()));
	if (targets.includes('macos')) {
		await buildMacos(csp);
	}
	if (targets.includes('windows')) {
		await buildWindows(csp);
	}
}

async function buildMacos(csp: typeof config.csp) {
	const { bundleId, minimumVersion, types, icon } = group('macos');
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
				MARKETING_VERSION: version,
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
		`CONFIGURATION_BUILD_DIR=${dirname(built)}`,
		'build',
	]);
	// Finder keys its icon cache on the bundle's mtime, which xcodebuild leaves alone.
	exec(['touch', built]);
	console.log(`Built ${built}`);
}

/** The plugin folder `register` copies, and the `.qlplugin` users install. */
function windowsBuild() {
	const { id } = group('windows');
	return {
		plugin: `${work}/build/windows/${id}`,
		archive: `${work}/build/windows/${name}.qlplugin`,
	};
}

async function buildWindows(csp: typeof config.csp) {
	const windows = group('windows');
	const { plugin, archive } = windowsBuild();
	// obj/ stays between builds, so NuGet restores only once.
	const project = `${work}/windows`;
	await rm(`${project}/web`, { recursive: true, force: true });
	await cp(web, `${project}/web`, { recursive: true });
	await cp(`${native}/Windows/Plugin.cs`, `${project}/Plugin.cs`);
	for (const [file, content] of Object.entries(
		windowsProject({ ...config, csp, windows }, version),
	)) {
		await writeFile(`${project}/${file}`, content);
	}
	await rm(plugin, { recursive: true, force: true });
	exec([
		'dotnet',
		'build',
		// A renamed windows.id leaves its old .csproj behind.
		`${project}/${windows.id}.csproj`,
		'--configuration',
		'Release',
		'--output',
		plugin,
		'--nologo',
		'--verbosity',
		'quiet',
	]);
	// A .qlplugin is a zip; bsdtar ships with macOS and Windows alike, but Git for
	// Windows may put GNU tar first on the PATH. Entries are named without `./`, as
	// QL-Win looks up QuickLook.Plugin.Metadata.config by exact name.
	const tar = onWindows
		? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32\\tar.exe')
		: 'tar';
	await rm(archive, { force: true });
	const entries = await readdir(plugin);
	exec([tar, '--create', '--format', 'zip', '--file', archive, '--exclude', '*.pdb', ...entries], {
		cwd: plugin,
	});
	console.log(`Built ${archive}`);
}

/** QL-Win's folder for plugins installed by the user. */
const qlWinPlugins = join(process.env.APPDATA ?? '', 'pooi.moe/QuickLook/QuickLook.Plugin');

/** Removes an installed plugin, whose DLL is locked while QuickLook runs. */
async function removePlugin(folder: string) {
	try {
		await rm(folder, { recursive: true, force: true });
	} catch (error) {
		const { code } = error as NodeJS.ErrnoException;
		if (code === 'EBUSY' || code === 'EPERM') {
			throw new Error(`Quit QuickLook first, it has ${folder} in use.`, { cause: error });
		}
		throw error;
	}
}

switch (subcommand) {
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
		if (onWindows) {
			const { plugin } = windowsBuild();
			if (!existsSync(plugin)) {
				throw new Error(`No build at ${plugin}, run 'quicklook build' first.`);
			}
			const folder = join(qlWinPlugins, group('windows').id);
			await removePlugin(folder);
			await cp(plugin, folder, { recursive: true });
			console.log(`Installed ${folder}\nQuit and restart QuickLook to load it.`);
			break;
		}
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
		console.log(
			`Installed ${installed}\nVerify with: pluginkit -mAv | grep ${group('macos').bundleId}`,
		);
		break;

	case 'unregister':
		if (onWindows) {
			const folder = join(qlWinPlugins, group('windows').id);
			await removePlugin(folder);
			console.log(`Removed ${folder}\nQuit and restart QuickLook to unload it.`);
			break;
		}
		exec([lsregister, '-u', installed], { quiet: true, nothrow: true });
		await rm(installed, { recursive: true, force: true });
		exec(['qlmanage', '-r'], { quiet: true, nothrow: true });
		console.log(`Removed ${installed}`);
		break;

	default:
		throw new Error(
			'Usage: quicklook dev|build:web|build|register|unregister [--platform macos|windows]',
		);
}
