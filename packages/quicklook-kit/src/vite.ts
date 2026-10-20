import type { Plugin } from 'vite';
import { addSources, loadConfig, type PageConfig, type Setting, serializeCsp } from './config.ts';

const virtualId = 'virtual:quicklook';

/** The schema's defaults as nested objects, the shape the extension injects. */
function settingDefaults(settings: Record<string, Setting>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(settings).map(([key, setting]) => [
			key,
			setting.type === 'object' ? settingDefaults(setting.properties) : setting.default,
		]),
	);
}

/**
 * Provides `virtual:quicklook`, adds the integrations' Vite plugins, and makes
 * the dev server report what the extension's CSP would block.
 */
export async function quicklook(): Promise<Plugin[]> {
	const config = await loadConfig();
	const { name, bundleId, types } = config;
	const pageConfig: PageConfig = { name, bundleId, types, public: config.public };
	const virtualSource = `export const config = ${JSON.stringify(pageConfig)};
export { browserFile, nativeFile } from 'quicklook-kit/runtime';
// The injected values in Quick Look, the defaults in the dev server and when prerendering.
export const settings = () => globalThis.window?.quicklook?.settings ?? ${JSON.stringify(settingDefaults(config.settings))};`;
	// Report-only, so violations show in the console without breaking HMR. Inline
	// scripts are only hashed at build time, and the dev server needs its socket.
	const devCsp = serializeCsp(
		addSources(
			addSources(config.csp, 'script-src', "'unsafe-inline'"),
			'connect-src',
			"'self'",
			'ws:',
		),
	);

	return [
		{
			name: 'quicklook',
			resolveId: (source) => (source === virtualId ? `\0${virtualId}` : undefined),
			load: (source) => (source === `\0${virtualId}` ? virtualSource : undefined),
			configureServer(server) {
				server.middlewares.use((_request, response, next) => {
					response.setHeader('Content-Security-Policy-Report-Only', devCsp);
					next();
				});
			},
		},
		...config.integrations.flatMap((integration) => integration.hooks?.vite?.() ?? []),
	];
}
