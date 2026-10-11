import { defineConfig } from 'quicklook-kit';

export default defineConfig({
	name: 'Example Preview',
	bundleId: 'com.example.ExamplePreview',
	types: [
		{
			id: 'com.example.ExamplePreview.example',
			description: 'Example File',
			extensions: ['example'],
			conformsTo: ['public.plain-text'],
		},
	],
	framework: 'nuxt',
});
