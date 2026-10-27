<script lang="ts">
	import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '#lib/components/ui/Button.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Textarea from '#lib/components/ui/Textarea.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import type { ButtonVariants } from '#lib/components/ui/variants.ts';
	import { getUser } from '#lib/remote/auth.remote.ts';
	import { addPanelToDashboard, listDashboards } from '#lib/remote/dashboards.remote.ts';
	import { usesQuery, type Panel } from '#lib/dashboard/types.ts';

	let {
		panel,
		variant = 'ghost',
		size = 'sm'
	}: {
		panel: Panel;
		variant?: ButtonVariants['variant'];
		size?: ButtonVariants['size'];
	} = $props();

	// adding panels is admin-only on the server, so viewers don't get the button
	const user = $derived(await getUser());

	let open = $state(false);
	let target = $state('');
	let title = $state('');
	let description = $state('');
	let adding = $state(false);
	let error = $state('');
	const ready = $derived(!usesQuery(panel.type) || !!panel.sql.trim());

	const dashboards = $derived(open ? (listDashboards().current ?? []) : []);
	function show() {
		title = panel.title || 'New panel';
		description = panel.description;
		error = '';
		open = true;
	}

	async function add() {
		if (!target) return;
		adding = true;
		error = '';
		try {
			const { type, datasource, sql, field, options } = $state.snapshot(panel);
			// id and position are assigned by the server
			const panelId = await addPanelToDashboard({
				dashboardId: target,
				panel: { type, title, description, datasource, sql, field, options }
			});
			open = false;
			// continue in the dashboard's panel editor
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved, plus a query string
			await goto(`${resolve('/dashboards/[id]', { id: target })}?editPanel=${panelId}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not add the panel';
		} finally {
			adding = false;
		}
	}
</script>

{#if user?.admin}
	<Button
		{variant}
		{size}
		disabled={!ready}
		title="Add this query to a dashboard as a panel"
		onclick={show}><LayoutDashboardIcon /> Add to dashboard</Button
	>

	<Dialog bind:open title="Add to dashboard">
		<div class="flex flex-col gap-3">
			<Field label="Dashboard">
				<Select bind:value={target}>
					<option value="" disabled>Choose a dashboard</option>
					{#each dashboards as d (d.id)}<option value={d.id}>{d.title}</option>{/each}
				</Select>
			</Field>
			<Field label="Panel title"><Input bind:value={title} /></Field>
			<Field label="Description" hint="Shown as a tooltip next to the title">
				<Textarea rows={3} bind:value={description} />
			</Field>
			{#if error}<p class="text-xs text-critical">{error}</p>{/if}
		</div>
		{#snippet footer()}
			<Button onclick={() => (open = false)}>Cancel</Button>
			<Button variant="primary" disabled={!target || !ready || adding} onclick={add}
				>Add panel</Button
			>
		{/snippet}
	</Dialog>
{/if}
