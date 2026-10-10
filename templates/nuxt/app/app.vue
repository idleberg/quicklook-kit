<script setup lang="ts">
import { browserFile, nativeFile, type QuickLookFile } from 'virtual:quicklook';
import { onMounted, shallowRef } from 'vue';
import FileViewer from '~/components/FileViewer.vue';

const file = shallowRef<QuickLookFile | undefined>(nativeFile());

async function open(files: FileList | null | undefined) {
	const picked = files?.[0];
	if (picked) {
		file.value = await browserFile(picked);
	}
}

onMounted(() => {
	window.addEventListener('dragover', (event) => event.preventDefault());
	window.addEventListener('drop', (event) => {
		event.preventDefault();
		open(event.dataTransfer?.files);
	});
});
</script>

<template>
	<FileViewer v-if="file" :file="file" />
	<!-- Only reachable in the browser: QuickLook always injects a file. -->
	<label v-else class="drop">
		Drop a file here, or click to pick one
		<input type="file" hidden @change="open(($event.target as HTMLInputElement).files)" />
	</label>
</template>

<style>
body {
	margin: 0;
}

.drop {
	display: grid;
	place-items: center;
	height: 100vh;
	font: 14px system-ui;
	color: GrayText;
	cursor: pointer;
}
</style>
