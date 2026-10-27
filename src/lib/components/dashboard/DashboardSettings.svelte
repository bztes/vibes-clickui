<script lang="ts">
	import * as v from 'valibot';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import Textarea from '#lib/components/ui/Textarea.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import Switch from '#lib/components/ui/Switch.svelte';
	import Tabs from '#lib/components/ui/Tabs.svelte';
	import Tab from '#lib/components/ui/Tab.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import SqlEditor from '#lib/components/SqlEditor.svelte';
	import DatasourceSelect from '#lib/components/DatasourceSelect.svelte';
	import { getDashboardState } from '#lib/dashboard/state.svelte.ts';
	import {
		DashboardExportSchema,
		REFRESH_INTERVALS,
		SERIES_COLOR_NAMES,
		type SeriesColorName,
		type Variable
	} from '#lib/dashboard/types.ts';
	import { SERIES_COLOR_VARS } from '#lib/format.ts';
	import { QUICK_RANGES } from '#lib/time.ts';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const dash = getDashboardState();

	let tab = $state<string>();
	let tagInput = $state('');
	let selectedVar = $state(0);
	let json = $state('');
	let jsonError = $state('');

	$effect(() => {
		if (open && tab === 'JSON model') {
			json = JSON.stringify(dash.toExport(), null, 2);
			jsonError = '';
		}
	});

	function addTag() {
		const tag = tagInput.trim();
		if (tag && !dash.tags.includes(tag)) dash.tags = [...dash.tags, tag];
		tagInput = '';
	}

	let colorName = $state('');
	let colorValue = $state<SeriesColorName>('blue');

	function pinColor() {
		const name = colorName.trim();
		if (!name) return;
		dash.model.seriesColors[name] = colorValue;
		colorName = '';
	}

	/** empty = automatic palette color */
	function setColor(name: string, color: string) {
		if (color) dash.model.seriesColors[name] = color as SeriesColorName;
		else delete dash.model.seriesColors[name];
	}

	function addVariable() {
		let n = dash.model.variables.length + 1;
		while (dash.model.variables.some((x) => x.name === `var${n}`)) n++;
		dash.model.variables.push({
			name: `var${n}`,
			label: '',
			type: 'query',
			datasource: '',
			query: '',
			multi: false,
			includeAll: false
		});
		selectedVar = dash.model.variables.length - 1;
	}

	function moveVariable(i: number, delta: number) {
		const list = dash.model.variables;
		const j = i + delta;
		if (j < 0 || j >= list.length) return;
		[list[i], list[j]] = [list[j], list[i]];
		selectedVar = j;
	}

	function applyJson() {
		try {
			const parsed = v.safeParse(DashboardExportSchema, JSON.parse(json));
			if (!parsed.success) {
				const issue = parsed.issues[0];
				jsonError = `${issue.path?.map((p) => p.key).join('.') ?? ''}: ${issue.message}`;
				return;
			}
			dash.replace(parsed.output);
			jsonError = '';
			open = false;
		} catch (e) {
			jsonError = e instanceof Error ? e.message : String(e);
		}
	}

	const variable = $derived<Variable | undefined>(dash.model.variables[selectedVar]);
	const preview = $derived(variable ? dash.variables.states[variable.name] : undefined);
	const nameValid = $derived(!variable || /^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.name));
</script>

<Dialog bind:open title="Dashboard settings" class="w-[min(56rem,calc(100vw-2rem))]">
	<Tabs bind:value={tab}>
		<Tab label="General" class="pt-4">
			<div class="flex max-w-xl flex-col gap-4">
				<Field label="Title"><Input bind:value={dash.title} /></Field>
				<Field label="Description"><Textarea rows={3} bind:value={dash.description} /></Field>
				<Field label="Tags">
					<div class="flex flex-wrap items-center gap-1.5">
						{#each dash.tags as tag (tag)}
							<button
								type="button"
								class="cursor-pointer"
								title="Remove tag"
								onclick={() => (dash.tags = dash.tags.filter((t) => t !== tag))}
							>
								<Badge tone="blue">{tag} ×</Badge>
							</button>
						{/each}
						<Input
							class="w-40"
							size="sm"
							placeholder="Add tag and press Enter"
							bind:value={tagInput}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									addTag();
								}
							}}
						/>
					</div>
				</Field>
				<div class="grid grid-cols-2 gap-3">
					<Field label="Default time range">
						<Select
							value={`${dash.model.time.from}|${dash.model.time.to}`}
							onchange={(e) => {
								const [from, to] = e.currentTarget.value.split('|');
								dash.model.time = { from, to };
							}}
						>
							{#each QUICK_RANGES as r (r.label)}<option value={`${r.from}|${r.to}`}
									>{r.label}</option
								>{/each}
						</Select>
					</Field>
					<Field label="Default auto refresh">
						<Select bind:value={dash.model.refresh}>
							{#each REFRESH_INTERVALS as r (r)}<option value={r}>{r || 'Off'}</option>{/each}
						</Select>
					</Field>
				</div>
				<p class="text-xs text-muted">
					The dashboard opens with these defaults. Changes made in the toolbar only live in the URL.
				</p>
			</div>
		</Tab>
		<Tab label="Variables" class="pt-4">
			<div class="grid gap-4 md:grid-cols-[13rem_1fr]">
				<div class="flex flex-col gap-1">
					{#each dash.model.variables as item, i (i)}
						<button
							type="button"
							class={[
								'flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm',
								i === selectedVar ? 'bg-surface-3 text-fg' : 'text-fg-2 hover:bg-surface-2'
							]}
							onclick={() => (selectedVar = i)}
						>
							<span class="truncate font-mono">${item.name}</span>
							<span class="text-[11px] text-muted">{item.type}</span>
						</button>
					{:else}
						<p class="px-2 py-1 text-xs text-muted">
							Variables let viewers filter every panel, e.g. by service.
						</p>
					{/each}
					<Button size="sm" variant="ghost" class="mt-1 self-start" onclick={addVariable}
						><PlusIcon /> New variable</Button
					>
				</div>

				{#if variable}
					<div class="flex min-w-0 flex-col gap-3">
						<div class="grid grid-cols-3 gap-3">
							<Field
								label="Name"
								issues={nameValid ? undefined : [{ message: 'Letters, digits and _ only' }]}
							>
								<Input mono bind:value={variable.name} aria-invalid={!nameValid} />
							</Field>
							<Field label="Label"
								><Input bind:value={variable.label} placeholder={variable.name} /></Field
							>
							<Field label="Type">
								<Select bind:value={variable.type}>
									<option value="query">Query</option>
									<option value="custom">Custom</option>
									<option value="textbox">Text box</option>
								</Select>
							</Field>
						</div>
						{#if variable.type === 'query'}
							<Field label="Data source"
								><DatasourceSelect bind:value={variable.datasource} /></Field
							>
							<div class="flex flex-col gap-1 text-xs font-medium text-fg-2">
								Query
								<SqlEditor bind:value={variable.query} rows={4} datasource={variable.datasource} />
								<span class="font-normal text-muted"
									>The first column becomes the options. Time macros and earlier variables work
									here.</span
								>
							</div>
						{:else if variable.type === 'custom'}
							<Field label="Values" hint="Comma separated"
								><Input bind:value={variable.query} placeholder="production, staging" /></Field
							>
						{:else}
							<Field label="Default value"><Input bind:value={variable.query} /></Field>
						{/if}
						{#if variable.type !== 'textbox'}
							<div class="flex gap-6">
								<Switch label="Multi-value" bind:checked={variable.multi} />
								<Switch label="Include All option" bind:checked={variable.includeAll} />
							</div>
							<div class="rounded-md bg-surface-2 p-2.5 text-xs">
								<p class="mb-1.5 font-medium text-fg-2">Preview of values</p>
								{#if preview?.error}
									<p class="font-mono text-critical">{preview.error}</p>
								{:else if preview?.loading}
									<p class="text-muted">Loading…</p>
								{:else}
									<div class="flex max-h-24 flex-wrap gap-1 overflow-auto">
										{#each preview?.options.slice(0, 50) ?? [] as o (o)}<Badge
												>{o || '(empty)'}</Badge
											>{:else}<span class="text-muted">No values</span>{/each}
									</div>
								{/if}
							</div>
						{/if}
						<p class="text-xs text-muted">
							Use <code class="font-mono text-violet">{`\${${variable.name}}`}</code> in panel
							queries, e.g.
							<code class="font-mono">{`column IN (\${${variable.name}})`}</code>.
						</p>
						<div class="flex gap-2 border-t border-line pt-3">
							<Button
								size="sm"
								onclick={() => moveVariable(selectedVar, -1)}
								disabled={selectedVar === 0}><ArrowUpIcon /> Up</Button
							>
							<Button
								size="sm"
								onclick={() => moveVariable(selectedVar, 1)}
								disabled={selectedVar === dash.model.variables.length - 1}
								><ArrowDownIcon /> Down</Button
							>
							<Button
								size="sm"
								variant="ghost"
								class="ml-auto text-critical"
								onclick={() => {
									dash.model.variables.splice(selectedVar, 1);
									selectedVar = Math.max(0, selectedVar - 1);
								}}
							>
								<TrashIcon /> Delete variable
							</Button>
						</div>
					</div>
				{/if}
			</div>
		</Tab>
		<Tab label="Colors" class="pt-4">
			<div class="flex max-w-xl flex-col gap-3">
				<p class="text-xs text-muted">
					Pin a color to an ID, e.g. a service or status. Panels match it against the value of their
					<em>Color by</em> column (or the series label if none is set) and draw it in this color; everything
					else takes the remaining palette colors.
				</p>
				<div class="flex max-h-96 flex-col gap-2 overflow-auto">
					{#each dash.colorKeys as name (name)}
						{@const pinned = dash.model.seriesColors[name]}
						<div class="flex items-center gap-2">
							{#if pinned}
								<span
									class="size-3 shrink-0 rounded-full"
									style:background="var({SERIES_COLOR_VARS[pinned]})"
								></span>
							{:else}
								<span class="size-3 shrink-0 rounded-full border border-dashed border-muted"></span>
							{/if}
							<span
								class={['min-w-0 flex-1 truncate font-mono text-sm', !pinned && 'text-muted']}
								title={name}>{name || '(empty)'}</span
							>
							<Select
								size="sm"
								class="w-28"
								value={pinned ?? ''}
								onchange={(e) => setColor(name, e.currentTarget.value)}
							>
								<option value="">auto</option>
								{#each SERIES_COLOR_NAMES as c (c)}<option value={c}>{c}</option>{/each}
							</Select>
						</div>
					{:else}
						<p class="text-xs text-muted">
							No IDs yet. Panels list theirs here once they show data; you can also add one below.
						</p>
					{/each}
				</div>
				<form
					class="flex items-center gap-2 border-t border-line pt-3"
					onsubmit={(e) => {
						e.preventDefault();
						pinColor();
					}}
				>
					<span
						class="size-3 shrink-0 rounded-full"
						style:background="var({SERIES_COLOR_VARS[colorValue]})"
					></span>
					<Input
						size="sm"
						mono
						class="flex-1"
						placeholder="ID, e.g. checkout"
						bind:value={colorName}
					/>
					<Select size="sm" class="w-28" bind:value={colorValue}>
						{#each SERIES_COLOR_NAMES as c (c)}<option value={c}>{c}</option>{/each}
					</Select>
					<Button size="sm" type="submit" disabled={!colorName.trim()}><PlusIcon /> Pin</Button>
				</form>
			</div>
		</Tab>
		<Tab label="JSON model" class="pt-4">
			<div class="flex flex-col gap-2">
				<Textarea mono rows={22} bind:value={json} spellcheck="false" />
				{#if jsonError}<p class="font-mono text-xs text-critical">{jsonError}</p>{/if}
				<div class="flex gap-2">
					<Button variant="primary" onclick={applyJson}>Apply JSON</Button>
					<Button onclick={() => navigator.clipboard.writeText(json)}>Copy to clipboard</Button>
				</div>
			</div>
		</Tab>
	</Tabs>
	{#snippet footer()}
		<Button onclick={() => (open = false)}>Close</Button>
	{/snippet}
</Dialog>
