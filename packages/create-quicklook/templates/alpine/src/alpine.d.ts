// @alpinejs/csp ships without types; its API is the standard build's.
declare module '@alpinejs/csp' {
	import type { Alpine } from 'alpinejs';

	const alpine: Alpine;
	export default alpine;
}
