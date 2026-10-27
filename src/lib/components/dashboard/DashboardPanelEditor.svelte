<script lang="ts">
	import { untrack } from 'svelte';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import Button from '#lib/components/ui/Button.svelte';
	import type { MenuEntry } from '#lib/components/ui/Menu.svelte';
	import { getDashboardState } from '#lib/dashboard/state.svelte.ts';
	import type { Panel } from '#lib/dashboard/types.ts';
	import { setParams } from '#lib/url-state.ts';
	import PanelEditor from './PanelEditor.svelte';

	let {
		panel,
		isNew = false,
		onclose,
		onadded
	}: { panel: Panel; isNew?: boolean; onclose: () => void; onadded?: () => void } = $props();

	const dash = getDashboardState();

	// edit a copy; nothing touches the dashboard until "Save"
	let draft = $state(structuredClone($state.snapshot(untrack(() => panel))));
	let sql = $state(untrack(() => panel.sql));
	let appliedSql = $state(untrack(() => panel.sql));

	// saving keeps the editor open
	function save() {
		dash.updatePanel({ ...$state.snapshot(draft), sql });
		// a new panel gets placed on save; keep that spot for later saves
		const saved = dash.panel(draft.id);
		if (saved) draft.gridPos = $state.snapshot(saved.gridPos);
		if (isNew) onadded?.();
	}

	// a panel not yet on the dashboard has nothing to copy or remove
	const menu = $derived<MenuEntry[]>(
		isNew
			? []
			: [
					{
						label: 'Duplicate',
						icon: CopyIcon,
						// the copy takes the unapplied edits and opens in the editor; the original stays as it was
						onclick: () => {
							const id = dash.duplicatePanel(panel.id, { ...$state.snapshot(draft), sql });
							if (id) void setParams({ editPanel: id });
						}
					},
					{
						label: 'Remove from dashboard',
						icon: TrashIcon,
						danger: true,
						onclick: () => {
							dash.removePanel(panel.id);
							onclose();
						}
					}
				]
	);
</script>

<svelte:window
	onkeydown={(e) => {
		// Escape inside a dialog, a field or an open menu only closes that
		if (
			e.key === 'Escape' &&
			!(e.target as HTMLElement).closest('dialog, input, textarea, select') &&
			!document.querySelector('[role="menu"]')
		)
			onclose();
	}}
/>

<div class="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Edit panel">
	<PanelEditor
		bind:draft
		bind:sql
		{appliedSql}
		onrun={(s) => (appliedSql = s)}
		heading={isNew ? 'Add panel' : 'Edit panel'}
		subheading={dash.title}
		onback={onclose}
		from={dash.from}
		to={dash.to}
		ontime={(from, to) => dash.setTime(from, to)}
		vars={dash.variables.values}
		allVars={dash.variables.allVars}
		ready={dash.variables.ready}
		{isNew}
		{menu}
	>
		{#snippet actions()}
			<Button onclick={onclose}>Discard</Button>
			<Button variant="primary" onclick={save}>{isNew ? 'Add' : 'Save'}</Button>
		{/snippet}
	</PanelEditor>
</div>
