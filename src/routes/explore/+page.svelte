<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import AddToDashboard from '#lib/components/AddToDashboard.svelte';
	import PanelEditor from '#lib/components/dashboard/PanelEditor.svelte';
	import { setParams } from '#lib/url-state.ts';
	import { normalizePanel, PANEL_TYPES, usesQuery, type PanelType } from '#lib/dashboard/types.ts';

	const from = $derived(page.url.searchParams.get('from') ?? 'now-1h');
	const to = $derived(page.url.searchParams.get('to') ?? 'now');
	const appliedSql = $derived(page.url.searchParams.get('sql') ?? '');

	// panels configured without SQL can't be explored
	const TYPES: readonly PanelType[] = PANEL_TYPES.filter(usesQuery);

	let draft = $state(
		untrack(() => {
			const type = page.url.searchParams.get('type') as PanelType;
			return normalizePanel({
				id: 'explore',
				type: TYPES.includes(type) ? type : 'table',
				datasource: page.url.searchParams.get('ds') ?? '',
				gridPos: { x: 0, y: 0, w: 12, h: 8 }
			});
		})
	);
	let sql = $state(untrack(() => page.url.searchParams.get('sql')) ?? '');
</script>

<svelte:head><title>Explore · vibes-clickui</title></svelte:head>

<PanelEditor
	bind:draft
	bind:sql
	{appliedSql}
	onrun={(s) => setParams({ sql: s || null, ds: draft.datasource || null })}
	heading="Explore"
	{from}
	{to}
	ontime={(f, t) => setParams({ from: f, to: t })}
	types={TYPES}
	isNew
	details={false}
	schemaOpen
>
	{#snippet actions()}
		<AddToDashboard variant="primary" size="md" panel={{ ...draft, sql }} />
	{/snippet}
</PanelEditor>
