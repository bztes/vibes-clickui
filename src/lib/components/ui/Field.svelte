<script lang="ts">
	import type { Snippet } from 'svelte';
	import { label as labelStyle } from './variants.ts';

	let {
		label,
		hint,
		issues,
		class: className,
		children
	}: {
		label: string;
		hint?: string;
		issues?: { message: string }[];
		class?: string;
		children: Snippet;
	} = $props();
</script>

<label class={labelStyle({ class: className })}>
	<span>{label}</span>
	{@render children()}
	{#each issues ?? [] as issue (issue.message)}
		<span class="font-normal text-critical">{issue.message}</span>
	{:else}
		{#if hint}<span class="font-normal text-muted">{hint}</span>{/if}
	{/each}
</label>
