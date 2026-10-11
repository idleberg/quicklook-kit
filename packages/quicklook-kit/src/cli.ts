#!/usr/bin/env bun
// Builds the page with the configured framework, wraps it in a QuickLook
// extension, and installs it. Usage: quicklook dev|build:web|build|register|unregister
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, rm } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { $, Glob } from 'bun';
import {
	addSources,
	type DeclaredType,
	loadConfig,
	serializeCsp,
	type XcodeSpec,
} from './config.ts';

const config = await loadConfig();
const { root, name, bundleId, macOS, types, framework, icon } = config;
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

/** Runs a framework command with the project's own binaries. */
async function run(command: string[]) {
	const child = Bun.spawn(['bun', 'run', ...command], {
		cwd: root,
		stdio: ['inherit', 'inherit', 'inherit'],
	});
	const code = await child.exited;
	if (code !== 0) {
		process.exit(code);
	}
}

/** Frameworks bootstrap with inline scripts; the CSP allows exactly those, by hash. */
async function inlineScriptHashes() {
	const hashes = new Set<string>();
	for await (const file of new Glob('**/*.html').scan(web)) {
		const html = await Bun.file(`${web}/${file}`).text();
		for (const [, body = ''] of html.matchAll(inlineScript)) {
			hashes.add(`'sha256-${createHash('sha256').update(body).digest('base64')}'`);
		}
	}
	return [...hashes];
}

/** Builds the page with the framework and copies it to `.quicklook/web`. */
async function buildWeb() {
	await run(framework.build.command);
	const outDir = resolve(root, framework.build.outDir);
	for (const integration of config.integrations) {
		await integration.hooks?.['build:done']?.({ outDir, config });
	}
	// Copied so the bundle's folder is always named `web`, whatever the framework calls it.
	await rm(web, { recursive: true, force: true });
	await cp(outDir, web, { recursive: true });
}

async function build() {
	await buildWeb();

	const csp = addSources(config.csp, 'script-src', ...(await inlineScriptHashes()));
	const spec: XcodeSpec = {
		name: target,
		options: { deploymentTarget: { macOS }, createIntermediateGroups: true },
		settings: {
			base: {
				SWIFT_VERSION: '6.0',
				MARKETING_VERSION: process.env.VERSION?.replace(leadingV, '') ?? '1.0',
				CURRENT_PROJECT_VERSION: '1',
				// Ad-hoc signing: enough for QuickLook to load it, no Apple Developer account needed.
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
					...(icon ? [{ path: resolve(root, icon), buildPhase: 'resources' }] : []),
				],
				settings: { PRODUCT_NAME: name, PRODUCT_BUNDLE_IDENTIFIER: bundleId },
				dependencies: [{ target: `${target}Extension`, embed: true, codeSign: true }],
				info: {
					path: `${work}/App/Info.plist`,
					properties: {
						CFBundleName: name,
						...(icon && { CFBundleIconFile: basename(icon, '.icns') }),
						LSMinimumSystemVersion: macOS,
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
				sources: [`${native}/Extension`, { path: web, type: 'folder', buildPhase: 'resources' }],
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
					},
				},
				info: {
					path: `${work}/Extension/Info.plist`,
					properties: {
						CFBundleDisplayName: name,
						// Read by PreviewViewController.swift.
						QLWebContentSecurityPolicy: serializeCsp(csp),
						QLMaxFileSize: config.maxFileSize,
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
	await Bun.write(`${work}/project.yml`, JSON.stringify(spec, null, 2));
	await $`xcodegen generate --quiet --spec ${work}/project.yml --project ${work}`;
	await $`xcodebuild -quiet -project ${work}/${target}.xcodeproj -scheme ${target} -configuration Release -destination generic/platform=macOS CONFIGURATION_BUILD_DIR=${work}/build build`;
	// Finder keys its icon cache on the bundle's mtime, which xcodebuild leaves alone.
	await $`touch ${built}`;
	console.log(`Built ${built}`);
}

switch (process.argv[2]) {
	case 'dev':
		await run(framework.build.dev);
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
		await $`rm -rf ${installed}`;
		await $`cp -R ${built} ${installed}`;
		await $`${lsregister} -f -R ${installed}`;
		await $`qlmanage -r`.quiet().nothrow();
		await $`qlmanage -r cache`.quiet().nothrow();
		// Launching the app is what registers its embedded extension.
		await $`open -g ${installed}`;
		console.log(`Installed ${installed}\nVerify with: pluginkit -mAv | grep ${bundleId}`);
		break;

	case 'unregister':
		await $`${lsregister} -u ${installed}`.quiet().nothrow();
		await $`rm -rf ${installed}`;
		await $`qlmanage -r`.quiet().nothrow();
		console.log(`Removed ${installed}`);
		break;

	default:
		throw new Error('Usage: quicklook dev|build:web|build|register|unregister');
}
