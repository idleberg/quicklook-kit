import angular from '@analogjs/vite-plugin-angular';
import { quicklook } from 'quicklook-kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		angular({
			tsconfig: 'tsconfig.json',
			// Only this app's components go through the Angular compiler; it would
			// empty out a linked package's TypeScript, which isn't in the tsconfig.
			transformFilter: (_code, id) => id.startsWith(`${import.meta.dirname}/src/`),
		}),
		quicklook(),
	],
});
