<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import StarIcon from '@lucide/svelte/icons/star';
	import SearchIcon from '@lucide/svelte/icons/search';
	import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import { resolve } from '$app/paths';
	import Button from '#lib/components/ui/Button.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Textarea from '#lib/components/ui/Textarea.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import { getUser } from '#lib/remote/auth.remote.ts';
	import {
		createDashboard,
		importDashboard,
		listDashboards,
		toggleStar
	} from '#lib/remote/dashboards.remote.ts';
	import { listDatasources } from '#lib/remote/datasources.remote.ts';
	import DashboardCard from '#lib/components/DashboardCard.svelte';
	import TemplatePicker, { type TemplateGroup } from '#lib/components/TemplatePicker.svelte';
	import { groupTemplates, TEMPLATES } from '#lib/dashboard/templates.ts';

	const [user, dashboards] = $derived(await Promise.all([getUser(), listDashboards()]));
	const datasources = $derived(user?.admin ? await listDatasources() : []);

	let search = $state('');
	let tag = $state<string | null>(null);
	let starredOnly = $state(false);
	let createOpen = $state(false);
	let importOpen = $state(false);

	const tags = $derived([...new Set(dashboards.flatMap((d) => d.tags))].sort());
	const filtered = $derived(
		dashboards
			.filter((d) => !starredOnly || d.starred)
			.filter((d) => !tag || d.tags.includes(tag))
			.filter((d) => `${d.title} ${d.description}`.toLowerCase().includes(search.toLowerCase()))
			.sort((a, b) => Number(b.starred) - Number(a.starred))
	);

	// the ungrouped templates (the blank dashboard) come first
	const templateGroups: TemplateGroup[] = groupTemplates(TEMPLATES).map(({ label, templates }) => ({
		label,
		items: templates.map((t) => ({
			id: t.id,
			name: t.name,
			description: t.dashboard.description,
			icon: LayoutDashboardIcon
		}))
	}));
	const titleOf = (id: string) => TEMPLATES.find((t) => t.id === id)?.dashboard.title ?? '';

	function openCreate() {
		picked = TEMPLATES[0].id;
		createDashboard.fields.set({ title: titleOf(picked), description: '', template: picked });
		createOpen = true;
	}

	/** the title follows the picked template until the user types their own */
	let picked = $state(TEMPLATES[0].id);
	function pickTemplate(id: string) {
		const title = createDashboard.fields.title.value() ?? '';
		if (!title || title === titleOf(picked)) createDashboard.fields.title.set(titleOf(id));
		createDashboard.fields.template.set(id);
		picked = id;
	}

	async function readFile(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		if (file) importDashboard.fields.json.set(await file.text());
	}
</script>

<svelte:head><title>Dashboards · vibes-clickui</title></svelte:head>

<div class="mx-auto max-w-6xl p-6">
	<header class="mb-6 flex flex-wrap items-center gap-3">
		<h1 class="text-xl font-semibold">Dashboards</h1>
		{#if user?.admin}
			<div class="ml-auto flex gap-2">
				<Button onclick={() => (importOpen = true)}><UploadIcon /> Import</Button>
				<Button variant="primary" onclick={openCreate}><PlusIcon /> New dashboard</Button>
			</div>
		{/if}
	</header>

	{#if user?.admin && datasources.length === 0}
		<div class="mb-6 flex items-center gap-4 rounded-xl border border-accent/40 bg-accent/8 p-5">
			<DatabaseIcon class="size-8 shrink-0 text-accent" />
			<div class="flex-1">
				<h2 class="font-semibold">Connect ClickHouse to get started</h2>
				<p class="text-sm text-fg-2">Add the ClickHouse database to query.</p>
			</div>
			<Button variant="primary" href={resolve('/settings/datasources')}
				>Add data source <ArrowRightIcon /></Button
			>
		</div>
	{/if}

	<div class="mb-4 flex flex-wrap items-center gap-2">
		<div class="relative w-72 max-sm:w-full">
			<SearchIcon class="absolute top-2 left-2.5 size-4 text-muted" />
			<Input class="pl-8" placeholder="Search dashboards" bind:value={search} />
		</div>
		<Button active={starredOnly} onclick={() => (starredOnly = !starredOnly)}
			><StarIcon /> Starred</Button
		>
		{#each tags as t (t)}
			<button type="button" class="cursor-pointer" onclick={() => (tag = tag === t ? null : t)}>
				<Badge tone={tag === t ? 'blue' : 'neutral'}>{t}</Badge>
			</button>
		{/each}
	</div>

	<ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		{#each filtered as d (d.id)}
			<li>
				<DashboardCard
					dashboard={d}
					onstar={() => toggleStar(d.id)}
					class="h-full rounded-xl border border-line bg-surface hover:border-accent/60"
				/>
			</li>
		{:else}
			<li
				class="col-span-full rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted"
			>
				{dashboards.length
					? 'No dashboards match your filters.'
					: user?.admin
						? 'No dashboards yet. Create one to get started.'
						: 'No dashboards have been shared with you yet. Ask an admin for access.'}
			</li>
		{/each}
	</ul>
</div>

<Dialog bind:open={createOpen} title="New dashboard" class="w-[min(40rem,calc(100vw-2rem))]">
	<form {...createDashboard} id="create-dashboard" class="flex flex-col gap-3">
		<Field label="Title" issues={createDashboard.fields.title.issues()}>
			<Input {...createDashboard.fields.title.as('text')} required />
		</Field>
		<Field label="Description">
			<Input {...createDashboard.fields.description.as('text')} />
		</Field>
		<input {...createDashboard.fields.template.as('hidden', picked)} />
		<TemplatePicker
			label="Start from"
			groups={templateGroups}
			value={picked}
			onpick={pickTemplate}
		/>
	</form>
	{#snippet footer()}
		<Button onclick={() => (createOpen = false)}>Cancel</Button>
		<Button
			type="submit"
			form="create-dashboard"
			variant="primary"
			disabled={!!createDashboard.pending}>Create</Button
		>
	{/snippet}
</Dialog>

<Dialog bind:open={importOpen} title="Import dashboard" class="w-[min(44rem,calc(100vw-2rem))]">
	<form {...importDashboard} id="import-dashboard" class="flex flex-col gap-3">
		<label class="flex flex-col gap-1 text-xs font-medium text-fg-2">
			Upload a JSON file
			<input
				type="file"
				accept="application/json,.json"
				class="text-sm text-fg-2 file:mr-3 file:rounded-md file:border file:border-line file:bg-surface-2 file:px-3 file:py-1 file:text-fg"
				onchange={readFile}
			/>
		</label>
		<Field label="…or paste the JSON model" issues={importDashboard.fields.json.issues()}>
			<Textarea
				{...importDashboard.fields.json.as('text')}
				mono
				rows={14}
				placeholder={'{ "title": "…", "model": { "panels": [] } }'}
			/>
		</Field>
	</form>
	{#snippet footer()}
		<Button onclick={() => (importOpen = false)}>Cancel</Button>
		<Button
			type="submit"
			form="import-dashboard"
			variant="primary"
			disabled={!!importDashboard.pending}>Import</Button
		>
	{/snippet}
</Dialog>
