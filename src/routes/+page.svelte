<script lang="ts">
	import Viewer from '$lib/Viewer.svelte';
	import { browserFile, nativeFile, type QuickLookFile } from '$lib/quicklook';

	let file = $state<QuickLookFile | undefined>(nativeFile());

	async function open(files: FileList | null | undefined) {
		if (files?.[0]) file = await browserFile(files[0]);
	}
</script>

<!-- Only reachable in the browser: QuickLook always injects a file. -->
<svelte:window
	ondragover={(e) => e.preventDefault()}
	ondrop={(e) => {
		e.preventDefault();
		open(e.dataTransfer?.files);
	}}
/>

{#if file}
	<Viewer {file} />
{:else}
	<label class="drop">
		Drop a file here, or click to pick one
		<input type="file" hidden onchange={(e) => open(e.currentTarget.files)} />
	</label>
{/if}

<style>
	.drop {
		display: grid;
		place-items: center;
		height: 100vh;
		font: 14px system-ui;
		color: GrayText;
		cursor: pointer;
	}
</style>
