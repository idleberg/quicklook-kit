import { defineConfig } from 'quicklook-kit';

export default defineConfig({
	name: 'QuickLook Example',
	bundleId: 'com.example.QuickLookExample',
	types: [
		{
			id: 'com.example.QuickLookExample.example',
			description: 'Example File',
			extensions: ['example'],
			conformsTo: ['public.plain-text'],
		},
	],
	framework: 'nuxt',
});
