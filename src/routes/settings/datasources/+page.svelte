<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import Button from '#lib/components/ui/Button.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import {
		deleteDatasource,
		listDatasources,
		saveDatasource,
		setDefaultDatasource,
		testDatasource
	} from '#lib/remote/datasources.remote.ts';

	type Datasource = Awaited<ReturnType<typeof listDatasources>>[number];

	const datasources = $derived(await listDatasources());

	let editing = $state<Datasource | 'new' | null>(null);
	let deleting = $state<Datasource | null>(null);
	let testResult = $state<Awaited<ReturnType<typeof testDatasource>> | null>(null);
	let testing = $state(false);

	function open(ds: Datasource | 'new') {
		editing = ds;
		testResult = null;
		const base =
			ds === 'new'
				? {
						id: '',
						name: datasources.length ? '' : 'ClickHouse',
						url: 'http://localhost:8123',
						username: 'vibes-clickui',
						database: 'telemetry',
						isDefault: datasources.length === 0
					}
				: {
						id: ds.id,
						name: ds.name,
						url: ds.url,
						username: ds.username,
						database: ds.database,
						isDefault: ds.isDefault
					};
		saveDatasource.fields.set({ ...base, _password: '' });
	}

	async function test() {
		testing = true;
		const { id, url, username, _password, database } = saveDatasource.fields.value();
		try {
			testResult = await testDatasource({
				id: id ?? '',
				url: url ?? '',
				username: username ?? '',
				_password: _password ?? '',
				database: database ?? ''
			});
		} catch (e) {
			testResult = { ok: false, error: e instanceof Error ? e.message : 'Invalid settings' };
		} finally {
			testing = false;
		}
	}

	const f = saveDatasource.fields;
</script>

<svelte:head><title>Data sources · vibes-clickui</title></svelte:head>

<div class="mx-auto max-w-4xl p-6">
	<header class="mb-2 flex items-center gap-3">
		<h1 class="text-xl font-semibold">Data sources</h1>
		<Button variant="primary" class="ml-auto" onclick={() => open('new')}
			><PlusIcon /> Add data source</Button
		>
	</header>
	<p class="mb-6 text-sm text-muted">
		The ClickHouse databases panels query. Queries always run read-only; a dedicated read-only user
		is still recommended.
	</p>

	<ul class="flex flex-col gap-2">
		{#each datasources as ds (ds.id)}
			<li class="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
				<DatabaseIcon class="size-5 shrink-0 text-accent" />
				<div class="min-w-0 flex-1">
					<p class="flex items-center gap-2 font-medium">
						{ds.name}
						{#if ds.isDefault}<Badge tone="blue">default</Badge>{/if}
					</p>
					{#if ds.passwordUnreadable}
						<p class="text-xs text-critical">
							Password can't be decrypted (BETTER_AUTH_SECRET changed) — edit and re-enter it.
						</p>
					{/if}
					<p class="truncate font-mono text-xs text-muted">
						{ds.username}@{ds.url} / {ds.database}
					</p>
				</div>
				{#if !ds.isDefault}
					<Button size="sm" variant="ghost" onclick={() => setDefaultDatasource(ds.id)}
						>Make default</Button
					>
				{/if}
				<Button size="sm" onclick={() => open(ds)}>Edit</Button>
				<Button size="sm" variant="ghost" class="text-critical" onclick={() => (deleting = ds)}
					>Delete</Button
				>
			</li>
		{:else}
			<li
				class="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong p-10 text-center"
			>
				<DatabaseIcon class="size-8 text-muted" />
				<h2 class="font-semibold">No data source yet</h2>
				<p class="max-w-md text-sm text-muted">
					Connect a ClickHouse database. With the bundled compose setup use
					<code class="font-mono text-fg-2">http://clickhouse:8123</code> (or
					<code class="font-mono text-fg-2">http://localhost:8123</code>
					when running the app locally), user
					<code class="font-mono text-fg-2">vibes-clickui</code>, database
					<code class="font-mono text-fg-2">telemetry</code>.
				</p>
				<Button variant="primary" onclick={() => open('new')}><PlusIcon /> Add data source</Button>
			</li>
		{/each}
	</ul>
</div>

<Dialog
	open={editing !== null}
	onclose={() => (editing = null)}
	title={editing === 'new' ? 'Add data source' : 'Edit data source'}
>
	<form
		id="datasource-form"
		class="flex flex-col gap-3"
		{...saveDatasource.enhance(async ({ submit }) => {
			if (await submit()) editing = null;
		})}
	>
		<input {...f.id.as('hidden', editing && editing !== 'new' ? editing.id : '')} />
		<Field label="Name" issues={f.name.issues()}><Input {...f.name.as('text')} required /></Field>
		<Field
			label="URL"
			hint="ClickHouse HTTP interface, e.g. http://localhost:8123"
			issues={f.url.issues()}
		>
			<Input {...f.url.as('url')} mono required />
		</Field>
		<div class="grid grid-cols-2 gap-3">
			<Field label="User" issues={f.username.issues()}
				><Input {...f.username.as('text')} required autocomplete="off" /></Field
			>
			<Field
				label="Password"
				hint={editing && editing !== 'new' && editing.passwordUnreadable
					? 'The stored password is unreadable — enter it again'
					: editing && editing !== 'new' && editing.hasPassword
						? 'Leave empty to keep the current password'
						: undefined}
			>
				<Input {...f._password.as('password')} autocomplete="new-password" />
			</Field>
		</div>
		<Field label="Database" issues={f.database.issues()}
			><Input {...f.database.as('text')} mono required /></Field
		>
		<label class="flex items-center gap-2 text-xs text-fg-2">
			<input {...f.isDefault.as('checkbox')} class="accent-accent" />
			Use as default data source
		</label>
		{#if testResult}
			<div
				class={[
					'flex items-start gap-2 rounded-md p-2.5 text-xs',
					testResult.ok ? 'bg-good/10 text-fg' : 'bg-critical/10 text-critical'
				]}
			>
				{#if testResult.ok}
					<CircleCheckIcon class="size-4 shrink-0 text-good" />
					<span
						>Connected to ClickHouse {testResult.version}. Found {testResult.tables} tables{testResult.tables ===
						0
							? ' — has anything been written yet?'
							: '.'}</span
					>
				{:else}
					<CircleXIcon class="size-4 shrink-0" />
					<span class="font-mono break-all">{testResult.error}</span>
				{/if}
			</div>
		{/if}
	</form>
	{#snippet footer()}
		<Button onclick={test} disabled={testing}>{testing ? 'Testing…' : 'Test connection'}</Button>
		<Button onclick={() => (editing = null)}>Cancel</Button>
		<Button
			type="submit"
			form="datasource-form"
			variant="primary"
			disabled={!!saveDatasource.pending}
		>
			{saveDatasource.pending ? 'Saving…' : 'Save & test'}
		</Button>
	{/snippet}
</Dialog>

<Dialog open={deleting !== null} onclose={() => (deleting = null)} title="Delete data source">
	<p class="text-sm text-fg-2">
		Delete <strong class="text-fg">{deleting?.name}</strong>? Panels using it fall back to the
		default data source.
	</p>
	{#snippet footer()}
		<Button onclick={() => (deleting = null)}>Cancel</Button>
		<Button
			variant="danger"
			onclick={async () => {
				if (deleting) await deleteDatasource(deleting.id);
				deleting = null;
			}}>Delete</Button
		>
	{/snippet}
</Dialog>
