/** The file QuickLook asked to preview. */
export interface QuickLookFile {
	name: string;
	/** Lowercase, without the dot. */
	extension: string;
	bytes: Uint8Array;
}

declare global {
	interface Window {
		/** Injected by the extension before the page loads. See native/Extension/PreviewViewController.swift. */
		quicklook?: { name: string; extension: string; base64: string };
	}
}

/** The previewed file inside QuickLook; `undefined` in the browser. */
export function nativeFile(): QuickLookFile | undefined {
	const injected = window.quicklook;
	if (!injected) {
		return;
	}
	return {
		name: injected.name,
		extension: injected.extension,
		bytes: Uint8Array.from(atob(injected.base64), (c) => c.charCodeAt(0)),
	};
}

/** The same shape from a file picked or dropped in the browser, for the dev server. */
export async function browserFile(file: File): Promise<QuickLookFile> {
	return {
		name: file.name,
		extension: file.name.includes('.') ? (file.name.split('.').pop() ?? '').toLowerCase() : '',
		bytes: new Uint8Array(await file.arrayBuffer()),
	};
}
