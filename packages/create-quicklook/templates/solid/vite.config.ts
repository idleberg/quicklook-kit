import solid from '@solidjs/vite-plugin';
import { quicklook } from 'quicklook-kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [solid(), quicklook()],
});
