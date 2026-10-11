<!-- Your preview goes here. `file.bytes` holds the raw file; decode it however
the format needs. This example shows it as UTF-8 text. -->
<script setup lang="ts">
import type { QuickLookFile } from 'virtual:quicklook';
import { computed } from 'vue';

const props = defineProps<{ file: QuickLookFile }>();
const text = computed(() => new TextDecoder().decode(props.file.bytes));
</script>

<template>
	<pre v-text="text" />
</template>

<style scoped>
pre {
	margin: 0;
	padding: 1rem;
	font:
		12px ui-monospace,
		monospace;
	white-space: pre-wrap;
}
</style>
