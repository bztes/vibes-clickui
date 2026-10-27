<script lang="ts">
	import type { Snippet } from 'svelte';
	import { badge, type BadgeTone } from './variants.ts';

	let {
		tone,
		class: className,
		children
	}: { tone?: BadgeTone; class?: string; children: Snippet } = $props();
</script>

<span class={badge({ tone, class: className })}>{@render children()}</span>
