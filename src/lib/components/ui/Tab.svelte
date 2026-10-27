<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ClassValue } from 'svelte/elements';
	import { getTabsContext } from './Tabs.svelte';

	let {
		label,
		value = label,
		keepMounted = false,
		class: className,
		children
	}: {
		label: string;
		/** identifies the tab for `bind:value` on Tabs, defaults to the label */
		value?: string;
		/** hides the content instead of destroying it while another tab is shown */
		keepMounted?: boolean;
		class?: ClassValue;
		children: Snippet;
	} = $props();

	const id = $props.id();
	const tabs = getTabsContext();
	const active = $derived(tabs.value === value);

	$effect(() =>
		tabs.register({
			id,
			get value() {
				return value;
			},
			get label() {
				return label;
			}
		})
	);
</script>

{#if active || keepMounted}
	<div
		role="tabpanel"
		id="{id}-panel"
		aria-labelledby="{id}-tab"
		class={['col-start-1 row-start-1 min-w-0', !active && 'invisible', className]}
	>
		{@render children()}
	</div>
{/if}
