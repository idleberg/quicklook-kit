import { defineNuxtConfig } from 'nuxt/config';
import { quicklook } from 'quicklook-kit/vite';

export default defineNuxtConfig({
	compatibilityDate: '2026-07-01',
	ssr: false,
	app: { head: { meta: [{ name: 'color-scheme', content: 'light dark' }] } },
	// The build manifest is fetched at runtime, which the extension's CSP blocks.
	experimental: { appManifest: false },
	vite: { plugins: [quicklook()] },
	typescript: {
		tsConfig: {
			compilerOptions: { allowImportingTsExtensions: true, types: ['quicklook-kit/virtual'] },
		},
	},
});
