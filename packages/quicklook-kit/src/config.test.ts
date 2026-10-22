import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

const roots: string[] = [];

async function load(config: Record<string, unknown>) {
	const root = await mkdtemp(join(tmpdir(), 'quicklook-config-'));
	roots.push(root);
	await writeFile(
		join(root, 'quicklook.config.json'),
		JSON.stringify({ name: 'Example', framework: 'sveltekit', ...config }),
	);
	return loadConfig(root);
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const macos = { bundleId: 'com.example.Example', types: ['public.json'] };
const windows = { id: 'QuickLook.Plugin.Example', extensions: ['json'] };

describe('loadConfig', () => {
	it('resolves the macos group with its defaults', async () => {
		const config = await load({ macos });
		expect(config.macos).toEqual({ ...macos, minimumVersion: '14.0' });
		expect(config.windows).toBeUndefined();
	});

	it('resolves the windows group on its own', async () => {
		const config = await load({ windows });
		expect(config.windows).toEqual(windows);
		expect(config.macos).toBeUndefined();
	});

	it('resolves both groups', async () => {
		const config = await load({ macos: { ...macos, minimumVersion: '15.0' }, windows });
		expect(config.macos?.minimumVersion).toBe('15.0');
		expect(config.windows).toEqual(windows);
	});

	const rejected: [config: Record<string, unknown>, message: string][] = [
		[{}, 'quicklook.config: add a "macos" or "windows" group for each platform to build for'],
		[{ macos, bundleId: 'com.example.Example' }, 'bundleId: moved to macos.bundleId'],
		[{ macos, icon: 'icon.icns' }, 'icon: moved to macos.icon'],
		[{ macos, macOS: '14.0' }, 'macOS: moved to macos.minimumVersion'],
		[{ macos, types: [] }, 'types: moved to macos.types, Windows uses windows.extensions'],
		[
			{ windows: { ...windows, id: 'Example' } },
			'windows.id: expected "QuickLook.Plugin." followed by a name, got "Example"',
		],
		[
			{ windows: { ...windows, id: 'QuickLook.Plugin.' } },
			'windows.id: expected "QuickLook.Plugin." followed by a name, got "QuickLook.Plugin."',
		],
		[
			{ windows: { ...windows, id: 'QuickLook.Plugin.My Plugin' } },
			'windows.id: expected "QuickLook.Plugin." followed by a name, got "QuickLook.Plugin.My Plugin"',
		],
		[
			{ windows: { ...windows, extensions: [] } },
			'windows.extensions: expected at least one extension',
		],
		[
			{ windows: { ...windows, extensions: ['.json'] } },
			'windows.extensions: write "json" without the dot',
		],
	];

	it.each(rejected)('rejects %j', async (config, message) => {
		await expect(load(config)).rejects.toThrow(message);
	});

	it('lists every moved field at once', async () => {
		await expect(load({ bundleId: 'com.example.Example', types: [] })).rejects.toThrow(
			'bundleId: moved to macos.bundleId\ntypes: moved to macos.types, Windows uses windows.extensions',
		);
	});
});
