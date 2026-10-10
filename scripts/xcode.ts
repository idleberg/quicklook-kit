// Generates the Xcode project from the "quicklook" block in package.json and
// builds, registers or unregisters the app. Usage: bun scripts/xcode.ts <command>
import { $ } from 'bun';
import { existsSync } from 'node:fs';
import pkg from '../package.json';

type FileType =
	| string // an existing type, e.g. "public.json"
	| { id: string; description: string; extensions: string[]; conformsTo: string[] };

const { name, bundleId, macOS } = pkg.quicklook;
const types: FileType[] = pkg.quicklook.types;
const target = name.replace(/[^A-Za-z0-9]/g, '');
const built = `${process.cwd()}/dist/${name}.app`;
const installed = `/Applications/${name}.app`;
const lsregister =
	'/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

const spec = {
	name: target,
	options: { deploymentTarget: { macOS }, createIntermediateGroups: true },
	settings: {
		base: {
			SWIFT_VERSION: '6.0',
			MARKETING_VERSION: process.env.VERSION?.replace(/^v/, '') ?? '1.0',
			CURRENT_PROJECT_VERSION: '1',
			// Ad-hoc signing: enough for QuickLook to load it, no Apple Developer account needed.
			CODE_SIGN_STYLE: 'Manual',
			CODE_SIGN_IDENTITY: '-'
		}
	},
	targets: {
		[target]: {
			type: 'application',
			platform: 'macOS',
			sources: ['native/App'],
			settings: { PRODUCT_NAME: name, PRODUCT_BUNDLE_IDENTIFIER: bundleId },
			dependencies: [{ target: `${target}Extension`, embed: true, codeSign: true }],
			info: {
				path: 'native/App/Info.plist',
				properties: {
					CFBundleName: name,
					LSMinimumSystemVersion: macOS,
					UTExportedTypeDeclarations: types
						.filter((type) => typeof type !== 'string')
						.map((type) => ({
							UTTypeIdentifier: type.id,
							UTTypeDescription: type.description,
							UTTypeConformsTo: type.conformsTo,
							UTTypeTagSpecification: { 'public.filename-extension': type.extensions }
						}))
				}
			}
		},
		[`${target}Extension`]: {
			type: 'app-extension',
			platform: 'macOS',
			sources: ['native/Extension', { path: 'dist/web/index.html', buildPhase: 'resources' }],
			// macOS silently ignores an extension whose bundle id isn't prefixed by its app's.
			settings: { PRODUCT_BUNDLE_IDENTIFIER: `${bundleId}.Extension` },
			dependencies: [{ sdk: 'QuickLookUI.framework' }, { sdk: 'WebKit.framework' }],
			entitlements: {
				path: 'native/Extension/Extension.entitlements',
				properties: {
					'com.apple.security.app-sandbox': true,
					'com.apple.security.files.user-selected.read-only': true,
					// WKWebView's content process won't launch in a sandbox without this,
					// even for a page that loads nothing. The page's CSP blocks all requests.
					'com.apple.security.network.client': true
				}
			},
			info: {
				path: 'native/Extension/Info.plist',
				properties: {
					CFBundleDisplayName: name,
					NSExtension: {
						NSExtensionPointIdentifier: 'com.apple.quicklook.preview',
						NSExtensionPrincipalClass: 'PreviewViewController',
						NSExtensionAttributes: {
							QLSupportedContentTypes: types.map((type) =>
								typeof type === 'string' ? type : type.id
							),
							QLSupportsSearchableItems: false
						}
					}
				}
			}
		}
	}
};

switch (process.argv[2]) {
	case 'build':
		// JSON is valid YAML.
		await Bun.write('project.yml', JSON.stringify(spec, null, 2));
		await $`xcodegen generate --quiet`;
		await $`xcodebuild -quiet -project ${target}.xcodeproj -scheme ${target} -configuration Release -destination generic/platform=macOS CONFIGURATION_BUILD_DIR=${process.cwd()}/dist build`;
		// Finder keys its icon cache on the bundle's mtime, which xcodebuild leaves alone.
		await $`touch ${built}`;
		console.log(`Built ${built}`);
		break;

	// macOS only loads extensions from apps in a standard location, and caches
	// registrations aggressively, including for apps since renamed or deleted.
	case 'register':
		if (!existsSync(built)) throw new Error(`No build at ${built}, run 'bun run build' first.`);
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
		throw new Error('Usage: bun scripts/xcode.ts build|register|unregister');
}
