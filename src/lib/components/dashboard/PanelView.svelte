<script lang="ts">
	import { keepPrevious } from '#lib/keep-previous.svelte.ts';
	import { untrack } from 'svelte';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import InfoIcon from '@lucide/svelte/icons/info';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import CompassIcon from '@lucide/svelte/icons/compass';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import MoveIcon from '@lucide/svelte/icons/move';
	import { resolve } from '$app/paths';
	import Menu, { type MenuItem } from '#lib/components/ui/Menu.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import { getDashboardState } from '#lib/dashboard/state.svelte.ts';
	import { usesQuery, type Panel } from '#lib/dashboard/types.ts';
	import { runPanel, runQuery } from '#lib/remote/query.remote.ts';
	import { replaceVariables } from '#lib/query/macros.ts';
	import { setParams } from '#lib/url-state.ts';
	import PanelContent from './PanelContent.svelte';

	let {
		panel,
		onDragStart,
		fullscreen = false
	}: {
		panel: Panel;
		onDragStart?: (e: PointerEvent) => void;
		fullscreen?: boolean;
	} = $props();

	const dash = getDashboardState();
	const rearranging = $derived(dash.editing && !!onDragStart);

	const sql = $derived(panel.sql);
	const needsQuery = $derived(usesQuery(panel.type) && sql.trim() !== '');
	// held while resizing, so a drag runs one query on drop instead of one per grid column
	let heldDataPoints = 0;
	const maxDataPoints = $derived.by(() => {
		const value = fullscreen ? 1600 : Math.round((panel.gridPos.w / 24) * 1400);
		if (!dash.dragging || !heldDataPoints) heldDataPoints = value;
		return heldDataPoints;
	});
	// admins run the (possibly unsaved) SQL directly; viewers run the saved panel by id
	const query = $derived.by(() => {
		if (!needsQuery || !dash.variables.ready) return undefined;
		const time = {
			from: dash.from,
			to: dash.to,
			vars: dash.variables.values,
			allVars: dash.variables.allVars,
			maxDataPoints
		};
		return dash.canEdit
			? runQuery({ datasource: panel.datasource, sql, ...time })
			: runPanel({ dashboardId: dash.id, panelId: panel.id, ...time });
	});

	// keep showing the previous result while a new query (e.g. after a time change) loads
	const latest = keepPrevious(() => query?.current);
	const result = $derived(needsQuery ? latest.current : undefined);

	$effect(() => {
		if (dash.tick === 0) return;
		untrack(() => void query?.refresh());
	});

	const loading = $derived(!!query?.loading || (needsQuery && !dash.variables.ready));
	const transportError = $derived(query?.error?.message);

	const exploreHref = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, only used to build a string
		const params = new URLSearchParams({
			sql: replaceVariables(panel.sql, dash.variables.values),
			from: dash.from,
			to: dash.to,
			type: panel.type
		});
		if (panel.datasource) params.set('ds', panel.datasource);
		return `${resolve('/explore')}?${params}`;
	});

	const menu = $derived<(MenuItem | 'separator')[]>([
		{
			label: 'View',
			icon: EyeIcon,
			onclick: () => setParams({ viewPanel: panel.id }),
			shortcut: 'v'
		},
		...(dash.canEdit
			? [
					{
						label: 'Edit',
						icon: PencilIcon,
						onclick: () => setParams({ editPanel: panel.id }),
						shortcut: 'e'
					}
				]
			: []),
		...(needsQuery
			? [{ label: 'Refresh', icon: RefreshCwIcon, onclick: () => void query?.refresh() }]
			: []),
		...(needsQuery && dash.canEdit && usesQuery(panel.type)
			? [{ label: 'Explore', icon: CompassIcon, href: exploreHref }]
			: []),
		...(dash.canEdit
			? [
					'separator' as const,
					...(dash.editing
						? [
								{
									label: 'Duplicate',
									icon: CopyIcon,
									onclick: () => dash.duplicatePanel(panel.id)
								}
							]
						: []),
					{
						label: 'Remove',
						icon: TrashIcon,
						danger: true,
						onclick: () => dash.removePanel(panel.id)
					}
				]
			: [])
	]);
</script>

<section
	class={[
		'group/panel relative isolate flex h-full flex-col overflow-hidden rounded-lg border bg-surface',
		rearranging ? 'border-dashed border-accent/50' : 'border-line'
	]}
	aria-label={panel.title || 'Panel'}
>
	<!-- svelte-ignore a11y_no_static_element_interactions (drag handle; panels are also movable via the editor) -->
	<header
		class={['flex h-8 shrink-0 items-center gap-1.5 pr-1 pl-3', rearranging ? 'cursor-move' : '']}
		onpointerdown={(e) => {
			if (!dash.editing || !onDragStart) return;
			if ((e.target as HTMLElement).closest('button, a')) return;
			onDragStart(e);
		}}
		ondblclick={() => dash.editing && setParams({ editPanel: panel.id })}
	>
		<h3 class="min-w-0 truncate text-[13px] font-medium text-fg">{panel.title}</h3>
		{#if panel.description}
			<span title={panel.description} class="text-muted"><InfoIcon class="size-3.5" /></span>
		{/if}
		{#if result?.error || transportError}
			<span title={result?.error ?? transportError} class="text-critical"
				><TriangleAlertIcon class="size-3.5" /></span
			>
		{/if}
		{#if result?.truncated}
			<span title="Result was truncated" class="text-[11px] text-warning">truncated</span>
		{/if}
		<div class="ml-auto flex items-center gap-1">
			{#if loading && result}<Spinner class="size-3.5" />{/if}
			<Menu items={menu}>
				{#snippet trigger({ toggle, open })}
					<button
						type="button"
						class={[
							'pointer-events-auto rounded p-1 text-muted hover:bg-surface-2 hover:text-fg',
							open
								? 'opacity-100'
								: 'opacity-0 group-hover/panel:opacity-100 focus-visible:opacity-100'
						]}
						onclick={toggle}
						aria-label="Panel menu"
					>
						<EllipsisVerticalIcon class="size-4" />
					</button>
				{/snippet}
			</Menu>
		</div>
	</header>
	<div class="min-h-0 flex-1 px-3 pb-2">
		{#if transportError && !result}
			<div class="flex h-full items-center justify-center text-xs text-critical">
				{transportError}
			</div>
		{:else}
			<PanelContent
				{panel}
				{result}
				{loading}
				onzoom={(from, to) => dash.setTime(String(from), String(to))}
			/>
		{/if}
	</div>
	{#if rearranging}
		<!-- svelte-ignore a11y_no_static_element_interactions (drag surface; panels are also movable via the editor) -->
		<div
			class="absolute inset-x-0 top-8 bottom-0 z-10 flex cursor-move items-center justify-center bg-surface/60 backdrop-blur-[1px] transition-colors hover:bg-accent/8"
			onpointerdown={(e) => onDragStart?.(e)}
			ondblclick={() => setParams({ editPanel: panel.id })}
		>
			<span
				class="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted shadow-sm"
			>
				<MoveIcon class="size-3.5" /> Drag to move
			</span>
		</div>
	{/if}
</section>
