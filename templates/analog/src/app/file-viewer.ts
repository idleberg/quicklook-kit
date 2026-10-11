// Your preview goes here. `file.bytes` holds the raw file; decode it however
// the format needs. This example shows it as UTF-8 text.

import type { QuickLookFile } from 'virtual:quicklook';
import { Component, computed, input } from '@angular/core';

@Component({
	selector: 'app-file-viewer',
	template: '<pre>{{ text() }}</pre>',
	styles: `
		pre {
			margin: 0;
			padding: 1rem;
			font:
				12px ui-monospace,
				monospace;
			white-space: pre-wrap;
		}
	`,
})
export class FileViewer {
	readonly file = input.required<QuickLookFile>();
	protected readonly text = computed(() => new TextDecoder().decode(this.file().bytes));
}
