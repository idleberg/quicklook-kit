// Types for the module the `quicklook()` Vite plugin provides. Reference it
// with `/// <reference types="quicklook-kit/virtual" />`.
declare module 'virtual:quicklook' {
	/** Build-time values from quicklook.config.*. */
	export const config: import('./config.ts').PageConfig;
	export { browserFile, nativeFile, type QuickLookFile } from 'quicklook-kit/runtime';
}
