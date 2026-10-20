// Types for the module the `quicklook()` Vite plugin provides. Reference it
// with `/// <reference types="quicklook-kit/virtual" />`.
declare module 'virtual:quicklook' {
	/** Build-time values from quicklook.config.*. */
	export const config: import('quicklook-kit').PageConfig;
	/** The user's settings: stored values over the config's defaults, as nested objects. */
	export const settings: () => Record<string, unknown>;
	export { browserFile, nativeFile, type QuickLookFile } from 'quicklook-kit/runtime';
}
