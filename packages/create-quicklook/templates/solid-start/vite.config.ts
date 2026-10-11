import { solidStart } from '@solidjs/start/config';
import { nitro } from 'nitro/vite';
import { quicklook } from 'quicklook-kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		// Client-only, prerendered to a static index.html in .output/public.
		solidStart({ ssr: false }),
		nitro({ preset: 'static', prerender: { routes: ['/'] } }),
		quicklook(),
	],
});
