import { browserFile, nativeFile, type QuickLookFile } from 'virtual:quicklook';
import Alpine from '@alpinejs/csp';
import { fileViewer } from './file-viewer.ts';

Alpine.data('app', () => ({
	file: nativeFile() as QuickLookFile | undefined,

	async open(files: FileList | null | undefined) {
		const picked = files?.[0];
		if (picked) {
			this.file = await browserFile(picked);
		}
	},
}));
Alpine.data('fileViewer', fileViewer);
Alpine.start();
