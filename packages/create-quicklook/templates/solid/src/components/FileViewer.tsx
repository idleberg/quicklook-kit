// Your preview goes here. `file.bytes` holds the raw file; decode it however
// the format needs. This example shows it as UTF-8 text.
import type { QuickLookFile } from 'virtual:quicklook';
import './FileViewer.css';

export default function FileViewer(props: { file: QuickLookFile }) {
	return <pre>{new TextDecoder().decode(props.file.bytes)}</pre>;
}
