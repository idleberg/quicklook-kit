import { describe, expect, it } from 'vitest';
import { windowsProject } from './windows.ts';

const config = {
	name: 'Example & Co',
	csp: { 'default-src': ["'none'"], 'script-src': ["'self'", 'https:'] },
	maxFileSize: 5_000_000,
	settings: {},
	windows: { id: 'QuickLook.Plugin.Example', extensions: ['json', 'JSONC'] },
};

describe('windowsProject', () => {
	it('names the assembly after windows.id', () => {
		const csproj = windowsProject(config, '1.2.3')['QuickLook.Plugin.Example.csproj'];
		expect(csproj).toContain(`<AssemblyName>${config.windows.id}</AssemblyName>`);
		expect(csproj).toContain('<Version>1.2.3</Version>');
	});

	it('writes the metadata QL-Win shows when installing', () => {
		expect(windowsProject(config, '1.2.3')['QuickLook.Plugin.Metadata.config']).toBe(
			`<?xml version="1.0" encoding="utf-8"?>
<Metadata>
  <Namespace>QuickLook.Plugin.Example</Namespace>
  <Version>1.2.3</Version>
  <Description>Example &amp; Co</Description>
</Metadata>
`,
		);
	});

	it('gives the host its extensions, size limit and CSP', () => {
		const manifest = JSON.parse(windowsProject(config, '1.2.3')['quicklook.json']);
		expect(manifest).toEqual({
			id: 'QuickLook.Plugin.Example',
			extensions: ['json', 'jsonc'],
			maxFileSize: 5_000_000,
			csp: "default-src 'none'; script-src 'self' https:",
			settings: [],
		});
	});

	it('flattens settings to dotted keys with their defaults and limits', () => {
		const { settings } = JSON.parse(
			windowsProject(
				{
					...config,
					settings: {
						wrap: { type: 'boolean', default: true, title: 'Wrap lines' },
						editor: {
							type: 'object',
							properties: {
								fontSize: { type: 'integer', default: 12, minimum: 8, maximum: 32 },
								theme: {
									type: 'string',
									default: 'dark',
									enum: ['light', { value: 'dark', description: 'Dark' }],
								},
							},
						},
					},
				},
				'1.2.3',
			)['quicklook.json'],
		);
		expect(settings).toEqual([
			{ key: 'wrap', type: 'boolean', default: true },
			{ key: 'editor.fontSize', type: 'integer', default: 12, minimum: 8, maximum: 32 },
			{ key: 'editor.theme', type: 'string', default: 'dark', enum: ['light', 'dark'] },
		]);
	});
});
