import { browserFile, nativeFile, type QuickLookFile } from 'virtual:quicklook';
import { createSignal, Show } from 'solid-js';
import FileViewer from '~/components/FileViewer';

export default function Home() {
	const [file, setFile] = createSignal<QuickLookFile | undefined>(nativeFile());

	async function open(files: FileList | null | undefined) {
		const picked = files?.[0];
		if (picked) {
			setFile(await browserFile(picked));
		}
	}

	window.addEventListener('dragover', (event) => event.preventDefault());
	window.addEventListener('drop', (event) => {
		event.preventDefault();
		open(event.dataTransfer?.files);
	});

	return (
		<Show
			when={file()}
			fallback={
				// Only reachable in the browser: QuickLook always injects a file.
				<label class="drop">
					Drop a file here, or click to pick one
					<input type="file" hidden={true} onChange={(event) => open(event.currentTarget.files)} />
				</label>
			}
		>
			{(current) => <FileViewer file={current()} />}
		</Show>
	);
}
