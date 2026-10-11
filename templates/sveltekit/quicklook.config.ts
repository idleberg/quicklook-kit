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
	framework: 'sveltekit',
	icon: '/private/tmp/claude-501/-Users-jan-Repositories-quicklook-nsis/06e878b9-f418-4636-b7aa-a121d889cfd1/scratchpad/AppIcon.icns',
});
