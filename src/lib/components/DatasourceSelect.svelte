<script lang="ts">
	import Select from '#lib/components/ui/Select.svelte';
	import { listDatasources } from '#lib/remote/datasources.remote.ts';

	let {
		value = $bindable(''),
		size = 'md',
		allowDefault = true,
		onchange
	}: {
		value?: string;
		size?: 'sm' | 'md';
		/** offer "Default" (empty value) */
		allowDefault?: boolean;
		onchange?: (value: string) => void;
	} = $props();

	const datasources = listDatasources();
	const list = $derived(datasources.current ?? []);
	const defaultName = $derived(list.find((d) => d.isDefault)?.name);
</script>

<Select {size} bind:value onchange={() => onchange?.(value)} aria-label="Data source">
	{#if allowDefault}
		<option value="">Default{defaultName ? ` (${defaultName})` : ''}</option>
	{/if}
	{#each list as ds (ds.id)}
		<option value={ds.id}>{ds.name}</option>
	{/each}
</Select>
