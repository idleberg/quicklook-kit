import { defineConfig } from 'quicklook-kit';

export default defineConfig({
	name: 'Quick Look Example',
	macos: {
		bundleId: 'com.example.QuickLookExample',
		types: [
			{
				id: 'com.example.QuickLookExample.example',
				description: 'Example File',
				extensions: ['example'],
				conformsTo: ['public.plain-text'],
			},
		],
	},
	framework: 'alpine',
});
