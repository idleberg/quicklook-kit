// Your preview goes here. `file.bytes` holds the raw file; decode it however
// the format needs. This example shows it as UTF-8 text.

import type { QuickLookFile } from 'virtual:quicklook';

export const fileViewer = (file: QuickLookFile) => ({
	text: new TextDecoder().decode(file.bytes),
});
