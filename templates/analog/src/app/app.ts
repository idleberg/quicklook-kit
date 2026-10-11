import { browserFile, nativeFile, type QuickLookFile } from 'virtual:quicklook';
import { Component, signal } from '@angular/core';
import { FileViewer } from './file-viewer';

@Component({
	selector: 'app-root',
	imports: [FileViewer],
	host: { '(window:dragover)': '$event.preventDefault()', '(window:drop)': 'drop($event)' },
	template: `
		@if (file(); as file) {
			<app-file-viewer [file]="file" />
		} @else {
			<!-- Only reachable in the browser: QuickLook always injects a file. -->
			<label class="drop">
				Drop a file here, or click to pick one
				<input type="file" hidden (change)="open($any($event.target).files)" />
			</label>
		}
	`,
	styles: `
		.drop {
			display: grid;
			place-items: center;
			height: 100vh;
			font: 14px system-ui;
			color: GrayText;
			cursor: pointer;
		}
	`,
})
export class App {
	protected readonly file = signal<QuickLookFile | undefined>(nativeFile());

	protected async open(files: FileList | null | undefined) {
		const picked = files?.[0];
		if (picked) {
			this.file.set(await browserFile(picked));
		}
	}

	protected drop(event: DragEvent) {
		event.preventDefault();
		this.open(event.dataTransfer?.files);
	}
}
