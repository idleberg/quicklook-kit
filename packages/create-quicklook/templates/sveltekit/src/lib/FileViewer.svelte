<!--
	Your preview goes here. `file.bytes` holds the raw file; decode it however
	the format needs. This example shows it as UTF-8 text.
-->
<script lang="ts">
	import type { QuickLookFile } from 'virtual:quicklook';

	let { file }: { file: QuickLookFile } = $props();

	const text = $derived(new TextDecoder().decode(file.bytes));
</script>

<pre>{text}</pre>

<style>
	:global(body) {
		margin: 0;
	}

	pre {
		margin: 0;
		padding: 1rem;
		font:
			12px ui-monospace,
			monospace;
		white-space: pre-wrap;
	}
</style>
