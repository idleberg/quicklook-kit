import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
export default {
	kit: {
		// The extension loads one file from its bundle: everything inlined, and
		// routing by hash, since the page's real path is somewhere in the app bundle.
		adapter: adapter({ pages: 'dist/web', assets: 'dist/web' }),
		output: { bundleStrategy: 'inline' },
		router: { type: 'hash' },
		// The previewed file is untrusted input; nothing on the page needs the network.
		csp: {
			directives: {
				'default-src': ['none'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:', 'blob:'],
				'font-src': ['self', 'data:'],
				'media-src': ['self', 'data:', 'blob:']
			}
		}
	}
};
