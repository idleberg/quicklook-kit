import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { afterEach, expect, it } from 'vitest';
import { quicklook } from './vite.ts';

const cwd = process.cwd();
let root: string;

async function virtualModule(command: 'serve' | 'build') {
	root = await mkdtemp(join(tmpdir(), 'quicklook-vite-'));
	await writeFile(join(root, 'Example.JSON'), '{}');
	await writeFile(
		join(root, 'quicklook.config.json'),
		JSON.stringify({
			name: 'Example',
			framework: 'sveltekit',
			windows: { id: 'QuickLook.Plugin.Example', extensions: ['json'] },
			devFile: 'Example.JSON',
		}),
	);
	process.chdir(root);
	const [plugin] = (await quicklook()) as unknown as [
		{
			config: (config: object, env: { command: string }) => void;
			load: (id: string) => Promise<string>;
		},
	];
	plugin.config({}, { command });
	return plugin.load('\0virtual:quicklook');
}

afterEach(async () => {
	process.chdir(cwd);
	await rm(root, { recursive: true, force: true });
});

it('injects devFile on the dev server', async () => {
	const file = { name: 'Example.JSON', extension: 'json', base64: btoa('{}') };
	expect(await virtualModule('serve')).toContain(`window.quicklook = ${JSON.stringify(file)};`);
});

it('leaves devFile out of builds', async () => {
	expect(await virtualModule('build')).not.toContain('window.quicklook =');
});
