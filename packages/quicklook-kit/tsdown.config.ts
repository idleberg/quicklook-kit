import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/cli.ts', 'src/config.ts', 'src/vite.ts', 'src/runtime.ts'],
	platform: 'node',
});
