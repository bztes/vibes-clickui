<script lang="ts">
	import StarIcon from '@lucide/svelte/icons/star';
	import MoveIcon from '@lucide/svelte/icons/move';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import XIcon from '@lucide/svelte/icons/x';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
	import type { Snippet } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Button from '#lib/components/ui/Button.svelte';
	import Menu, { type MenuEntry } from '#lib/components/ui/Menu.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import TimeRangePicker from '#lib/components/TimeRangePicker.svelte';
	import RefreshPicker from '#lib/components/RefreshPicker.svelte';
	import { DashboardState, setDashboardState } from '#lib/dashboard/state.svelte.ts';
	import type { DashboardRecord, Panel } from '#lib/dashboard/types.ts';
	import {
		deleteDashboard,
		duplicateDashboard,
		saveDashboard,
		toggleStar
	} from '#lib/remote/dashboards.remote.ts';
	import { parseDuration } from '#lib/time.ts';
	import { setParams } from '#lib/url-state.ts';
	import DashboardGrid from './DashboardGrid.svelte';
	import DashboardSettings from './DashboardSettings.svelte';
	import DashboardPanelEditor from './DashboardPanelEditor.svelte';
	import PanelView from './PanelView.svelte';
	import VariablesBar from './VariablesBar.svelte';

	let { record, children }: { record: DashboardRecord; children?: Snippet } = $props();

	// the record seeds an editable copy once; the parent re-creates this component per dashboard id
	// svelte-ignore state_referenced_locally
	const dash = new DashboardState(record, page.url.searchParams.has('edit'));
	setDashboardState(dash);

	let settingsOpen = $state(false);
	let deleteOpen = $state(false);
	let conflictOpen = $state(false);
	let saving = $state(false);
	let saveError = $state('');

	const viewPanel = $derived(dash.panel(page.url.searchParams.get('viewPanel') ?? ''));
	const editPanel = $derived(
		dash.canEdit ? dash.panel(page.url.searchParams.get('editPanel') ?? '') : undefined
	);

	// auto refresh, paused while the tab is hidden
	$effect(() => {
		const ms = parseDuration(dash.refreshInterval);
		if (!ms) return;
		const timer = setInterval(() => {
			if (!document.hidden) dash.tick++;
		}, ms);
		return () => clearInterval(timer);
	});

	beforeNavigate((nav) => {
		const leaving = nav.to?.url.pathname !== page.url.pathname;
		if (!leaving || !dash.dirty) return;
		// flush a pending autosave; only ask when saving is already failing
		if (!saveError && !conflictOpen) void save();
		else if (!confirm('You have unsaved changes. Leave anyway?')) nav.cancel();
	});

	let saveQueued = false;

	async function save(force = false) {
		// a save started while another is in flight would carry a stale version and conflict
		if (saving) {
			saveQueued = true;
			return;
		}
		saving = true;
		saveError = '';
		const dashboard = dash.toExport();
		try {
			const result = await saveDashboard({ id: dash.id, version: dash.version, dashboard, force });
			if (result.conflict) {
				conflictOpen = true;
				return;
			}
			dash.markSaved(result.version, JSON.stringify(dashboard));
			conflictOpen = false;
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Saving failed';
		} finally {
			saving = false;
			if (saveQueued && !conflictOpen) {
				saveQueued = false;
				if (dash.dirty) void save();
			}
		}
	}

	// every change saves itself shortly after it's made; a drag saves once the panel is dropped
	$effect(() => {
		dash.snapshot();
		if (!dash.dirty || dash.dragging || conflictOpen) return;
		const timer = setTimeout(() => void save(), 500);
		return () => clearTimeout(timer);
	});

	function exportJson() {
		const blob = new Blob([JSON.stringify(dash.toExport(), null, 2)], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `${dash.title.replace(/[^\w-]+/g, '-').toLowerCase()}.json`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	/** a panel being added: it's edited like any other, and only joins the dashboard on "Add" */
	let newPanel = $state<Panel>();

	function openAdd() {
		newPanel = dash.newPanel();
	}

	function closeEditor() {
		newPanel = undefined;
		void setParams({ editPanel: null });
	}

	/** once added, the new panel keeps its editor open as a regular one */
	function onAdded() {
		const id = newPanel?.id;
		if (id) void setParams({ editPanel: id }).then(() => (newPanel = undefined));
	}

	const editorPanel = $derived(newPanel ?? editPanel);

	const adminActions = $derived<MenuEntry[]>([
		{ label: 'Add panel', icon: PlusIcon, onclick: openAdd },
		dash.editing
			? { label: 'Done rearranging', icon: XIcon, onclick: exitEdit }
			: { label: 'Rearrange', icon: MoveIcon, onclick: () => (dash.editing = true) },
		{ label: 'Settings', icon: SettingsIcon, onclick: () => (settingsOpen = true) },
		'separator',
		{
			label: 'Duplicate',
			icon: CopyIcon,
			onclick: async () => {
				const id = await duplicateDashboard(dash.id);
				await goto(resolve('/dashboards/[id]', { id }));
			}
		},
		'separator',
		{ label: 'Delete', icon: TrashIcon, danger: true, onclick: () => (deleteOpen = true) }
	]);

	function exitEdit() {
		dash.editing = false;
		void setParams({ edit: null });
	}

	function keydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			if (dash.dirty) void save();
			return;
		}
		if (target.closest('input, textarea, select, [contenteditable]') || editorPanel) return;
		if (e.key === 'Escape' && viewPanel) void setParams({ viewPanel: null });
	}
</script>

<svelte:window onkeydown={keydown} />

<svelte:head><title>{dash.title} · vibes-clickui</title></svelte:head>

<div class="flex min-h-full flex-col">
	<header
		class="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-line bg-bg/90 px-4 py-2 backdrop-blur"
	>
		<div class="flex min-w-0 items-center gap-1.5">
			<a href={resolve('/')} class="text-sm text-muted hover:text-fg">Dashboards</a>
			<span class="text-muted">/</span>
			<h1 class="truncate text-sm font-semibold">{dash.title}</h1>
			<button
				type="button"
				class="cursor-pointer rounded p-1 text-muted hover:text-warning"
				aria-label={dash.starred ? 'Unstar dashboard' : 'Star dashboard'}
				aria-pressed={dash.starred}
				onclick={() => {
					dash.starred = !dash.starred;
					void toggleStar(dash.id);
				}}
			>
				<StarIcon class={['size-4', dash.starred && 'fill-warning text-warning']} />
			</button>
			{#if saving || (dash.dirty && !saveError)}<span class="text-xs text-muted">Saving…</span>{/if}
			{#if saveError}<span class="text-xs text-critical">{saveError}</span>{/if}
		</div>

		<div class="ml-auto flex flex-wrap items-center gap-2">
			{#if dash.editing}
				<Button onclick={exitEdit}><XIcon /> Done rearranging</Button>
			{/if}
			<TimeRangePicker from={dash.from} to={dash.to} onchange={(f, t) => dash.setTime(f, t)} />
			<RefreshPicker
				interval={dash.refreshInterval}
				onrefresh={() => dash.tick++}
				onchange={(value) => dash.setRefresh(value)}
			/>
			<Menu
				items={[
					{ label: 'Export JSON', icon: DownloadIcon, onclick: exportJson },
					...(dash.canEdit ? ['separator' as const, ...adminActions] : [])
				]}
			>
				{#snippet trigger({ toggle })}
					<Button size="icon" onclick={toggle} aria-label="More dashboard actions"
						><EllipsisIcon /></Button
					>
				{/snippet}
			</Menu>
		</div>
	</header>

	{#if dash.model.variables.length}
		<div class="px-4 pt-3"><VariablesBar /></div>
	{/if}

	<main class="flex-1 p-4">
		{@render children?.()}
		{#if viewPanel}
			<div class="flex h-[calc(100vh-9rem)] flex-col gap-2">
				<Button
					size="sm"
					variant="ghost"
					class="self-start"
					onclick={() => setParams({ viewPanel: null })}
				>
					<ArrowLeftIcon /> Back to dashboard
				</Button>
				<div class="min-h-0 flex-1"><PanelView panel={viewPanel} fullscreen /></div>
			</div>
		{:else if dash.model.panels.length === 0}
			<div
				class="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong p-10 text-center"
			>
				<LayoutDashboardIcon class="size-8 text-muted" />
				<h2 class="font-semibold">This dashboard is empty</h2>
				{#if dash.canEdit}
					<p class="text-sm text-muted">
						Add a panel and write a ClickHouse query to visualize your telemetry.
					</p>
					<Button variant="primary" onclick={openAdd}><PlusIcon /> Add panel</Button>
				{/if}
			</div>
		{:else}
			<DashboardGrid />
		{/if}
	</main>
</div>

{#if editorPanel}
	{#key editorPanel.id}
		<DashboardPanelEditor
			panel={editorPanel}
			isNew={!!newPanel}
			onclose={closeEditor}
			onadded={onAdded}
		/>
	{/key}
{/if}

<DashboardSettings bind:open={settingsOpen} />

<Dialog bind:open={deleteOpen} title="Delete dashboard">
	<p class="text-sm text-fg-2">
		Delete <strong class="text-fg">{dash.title}</strong>? This can't be undone.
	</p>
	{#snippet footer()}
		<Button onclick={() => (deleteOpen = false)}>Cancel</Button>
		<Button
			variant="danger"
			onclick={async () => {
				await deleteDashboard(dash.id);
				dash.saved = dash.snapshot();
				await goto(resolve('/'));
			}}
		>
			Delete
		</Button>
	{/snippet}
</Dialog>

<Dialog bind:open={conflictOpen} title="Someone else saved this dashboard">
	<p class="text-sm text-fg-2">
		The dashboard changed since you opened it. Overwrite their changes with yours, or reload to see
		the latest version (your edits will be lost).
	</p>
	{#snippet footer()}
		<Button onclick={() => location.reload()}>Reload</Button>
		<Button variant="danger" onclick={() => save(true)}>Overwrite</Button>
	{/snippet}
</Dialog>
