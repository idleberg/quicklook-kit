import { defineConfig } from 'astro/config';
import { quicklook } from 'quicklook-kit/vite';

export default defineConfig({
	vite: { plugins: [quicklook()] },
});
