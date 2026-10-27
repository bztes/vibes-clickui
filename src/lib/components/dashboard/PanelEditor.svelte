<script lang="ts">
	import { keepPrevious } from '#lib/keep-previous.svelte.ts';
	import type { Snippet } from 'svelte';
	import PlayIcon from '@lucide/svelte/icons/play';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import PencilLineIcon from '@lucide/svelte/icons/pencil-line';
	import Button from '#lib/components/ui/Button.svelte';
	import Menu, { type MenuEntry } from '#lib/components/ui/Menu.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import Textarea from '#lib/components/ui/Textarea.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import Switch from '#lib/components/ui/Switch.svelte';
	import Tabs from '#lib/components/ui/Tabs.svelte';
	import Tab from '#lib/components/ui/Tab.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import SqlEditor from '#lib/components/SqlEditor.svelte';
	import DatasourceSelect from '#lib/components/DatasourceSelect.svelte';
	import TimeRangePicker from '#lib/components/TimeRangePicker.svelte';
	import SchemaBrowser from '#lib/components/SchemaBrowser.svelte';
	import TableIcon from '@lucide/svelte/icons/table';
	import type { VariableValues } from '#lib/query/macros.ts';
	import {
		PANEL_TYPES,
		PANEL_TYPE_LABELS,
		REDUCERS,
		UNITS,
		UNIT_LABELS,
		normalizePanel,
		usesQuery,
		type Panel
	} from '#lib/dashboard/types.ts';
	import { groupTemplates, PANEL_TEMPLATES } from '#lib/dashboard/templates.ts';
	import { PANEL_TYPE_ICONS } from '#lib/dashboard/icons.ts';
	import { runQuery } from '#lib/remote/query.remote.ts';
	import PanelContent from './PanelContent.svelte';
	import ThresholdsEditor from './ThresholdsEditor.svelte';

	let {
		draft = $bindable(),
		sql = $bindable(),
		appliedSql,
		onrun,
		heading,
		subheading = '',
		onback,
		actions,
		menu = [],
		details = true,
		from,
		to,
		ontime,
		vars = {},
		allVars = [],
		ready = true,
		isNew = false,
		types = PANEL_TYPES,
		schemaOpen = $bindable(false)
	}: {
		/** the panel being edited; `sql` is its query as typed */
		draft: Panel;
		sql: string;
		/** the query the preview runs */
		appliedSql: string;
		/** the typed SQL should become the applied one */
		onrun: (sql: string) => void;
		heading: string;
		subheading?: string;
		onback?: () => void;
		/** buttons on the right of the header, e.g. "Apply" */
		actions: Snippet;
		/** extra entries for the header menu, below "Title & description" */
		menu?: MenuEntry[];
		/** false drops "Title & description", e.g. when they're asked for elsewhere */
		details?: boolean;
		from: string;
		to: string;
		ontime: (from: string, to: string) => void;
		vars?: VariableValues;
		allVars?: string[];
		/** false holds the query back, e.g. while variables load */
		ready?: boolean;
		/** a new panel takes the size of a picked template */
		isNew?: boolean;
		/** visualizations to choose from */
		types?: readonly Panel['type'][];
		/** shows the table browser next to the editor */
		schemaOpen?: boolean;
	} = $props();

	let bottomTab = $state<'Query' | 'Generated SQL'>('Query');
	let detailsOpen = $state(false);

	const menuItems = $derived<MenuEntry[]>(
		details
			? [
					{
						label: 'Title & description',
						icon: PencilLineIcon,
						onclick: () => (detailsOpen = true)
					},
					...(menu.length ? ['separator' as const, ...menu] : [])
				]
			: menu
	);

	const query = $derived(
		usesQuery(draft.type) && appliedSql.trim() && ready
			? runQuery({
					datasource: draft.datasource,
					sql: appliedSql,
					from,
					to,
					vars,
					allVars,
					maxDataPoints: 1200
				})
			: undefined
	);
	const latest = keepPrevious(() => query?.current);
	const result = $derived(latest.current);

	const previewPanel = $derived({ ...draft, sql: appliedSql });
	const dirtySql = $derived(sql !== appliedSql);

	let editor = $state<SqlEditor>();

	function insert(text: string) {
		if (editor && bottomTab === 'Query') return editor.insertText(text);
		// the generated SQL is shown, so append and go back to the query
		sql = sql.trimEnd() ? `${sql}${/\s$/.test(sql) ? '' : ' '}${text}` : text;
		bottomTab = 'Query';
	}

	function run() {
		if (sql === appliedSql) void query?.refresh();
		else onrun(sql);
	}

	// predefined panels of the picked visualization; picking one replaces the query and options
	const templateGroups = $derived(
		groupTemplates(PANEL_TEMPLATES.filter((t) => t.types.includes(draft.type)))
	);
	let template = $state('');
	let templateTitle = '';

	function pickTemplate(id: string) {
		const t = PANEL_TEMPLATES.find((t) => t.id === id);
		if (!t) return;
		const { id: panelId, type, datasource, gridPos, title, description } = $state.snapshot(draft);
		// the visualization stays; the template is only offered for the ones it lists
		const next = normalizePanel({ ...structuredClone(t.panel), id: panelId, type, datasource });
		// a new panel takes the template's size; an existing one keeps its place on the grid
		next.gridPos = isNew ? { ...gridPos, w: next.gridPos.w, h: next.gridPos.h } : gridPos;
		// the title and description follow the template until the user writes their own
		if (title && title !== templateTitle) next.title = title;
		if (description) next.description = description;
		templateTitle = next.title;
		draft = next;
		sql = next.sql;
		onrun(next.sql);
		template = id;
	}

	function pickType(type: Panel['type']) {
		draft.type = type;
		// the picked template stays selected when the new visualization offers it too
		if (!PANEL_TEMPLATES.find((t) => t.id === template)?.types.includes(type)) template = '';
	}

	const columns = $derived(result?.columns ?? []);
	const numericColumns = $derived(columns.filter((c) => c.kind === 'number'));
	const labelColumns = $derived(columns.filter((c) => c.kind === 'string' || c.kind === 'bool'));
	const textColumns = $derived(columns.filter((c) => c.kind === 'string'));
</script>

<!-- the column pickers list the last run's columns, so offer a rerun while the SQL is edited -->
{#snippet columnsHeading(title: string)}
	<h3
		class="flex h-7 items-center justify-between text-xs font-semibold tracking-wide text-muted uppercase"
	>
		{title}
		{#if dirtySql}
			<Button
				size="icon-sm"
				variant="primary"
				title="Run query to update columns"
				aria-label="Run query to update columns"
				onclick={run}
			>
				<PlayIcon />
			</Button>
		{/if}
	</h3>
{/snippet}

<div class="flex h-full min-h-0 flex-col bg-bg">
	<header
		class="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-1.5"
	>
		{#if onback}
			<Button variant="ghost" size="icon" onclick={onback} aria-label="Back"
				><ArrowLeftIcon /></Button
			>
		{/if}
		<h2 class="text-sm font-semibold">{heading}</h2>
		{#if subheading}<span class="truncate text-sm text-muted">{subheading}</span>{/if}
		<div class="ml-auto flex flex-wrap items-center gap-2">
			<!-- scopes the preview, the query and the table browser alike -->
			{#if usesQuery(draft.type)}
				<div class="w-48"><DatasourceSelect bind:value={draft.datasource} /></div>
			{/if}
			<TimeRangePicker {from} {to} onchange={ontime} />
			{@render actions()}
			{#if menuItems.length}
				<Menu items={menuItems}>
					{#snippet trigger({ toggle })}
						<Button size="icon" onclick={toggle} aria-label="More panel actions"
							><EllipsisIcon /></Button
						>
					{/snippet}
				</Menu>
			{/if}
		</div>
	</header>

	<div class="flex min-h-0 flex-1 max-lg:flex-col">
		{#if schemaOpen && usesQuery(draft.type)}
			<SchemaBrowser
				datasource={draft.datasource}
				oninsert={insert}
				class="w-64 shrink-0 border-line bg-surface max-lg:max-h-56 max-lg:w-full max-lg:border-b lg:border-r"
			/>
		{/if}
		<div class="flex min-h-0 min-w-0 flex-1 flex-col">
			<!-- preview -->
			<div class="flex min-h-64 flex-[1.1] flex-col p-3">
				<div class="mb-2 flex items-center gap-2">
					{#if usesQuery(draft.type)}
						<Button
							size="sm"
							variant="ghost"
							active={schemaOpen}
							onclick={() => (schemaOpen = !schemaOpen)}
							aria-pressed={schemaOpen}
						>
							<TableIcon />
							Tables
						</Button>
					{/if}
					{#if query?.loading}<Spinner class="size-4" />{/if}
					{#if result && !result.error}
						<span class="ml-auto text-xs text-muted">
							{result.rows.length.toLocaleString()} rows{result.truncated ? ' (truncated)' : ''} · {result.elapsedMs}
							ms · interval {result.intervalSeconds}s
						</span>
					{/if}
				</div>
				<div class="flex min-h-0 flex-1 flex-col rounded-lg border border-line bg-surface">
					<div class="h-8 shrink-0 truncate px-3 pt-2 text-[13px] font-medium">{draft.title}</div>
					<div class="min-h-0 flex-1 px-3 pb-2">
						<PanelContent
							panel={previewPanel}
							{result}
							loading={!!query?.loading}
							onzoom={(from, to) => ontime(String(from), String(to))}
						/>
					</div>
				</div>
			</div>

			<!-- query -->
			{#if usesQuery(draft.type)}
				<Tabs
					bind:value={bottomTab}
					class="border-t border-line bg-surface"
					headerClass="px-3 pt-1"
				>
					{#snippet actions()}
						<Button size="sm" variant={dirtySql ? 'primary' : 'secondary'} onclick={run}>
							<PlayIcon />
							Run query <kbd class="text-[10px] opacity-70">Ctrl+↵</kbd>
						</Button>
					{/snippet}
					<Tab label="Query" keepMounted class="p-3">
						<SqlEditor
							bind:this={editor}
							bind:value={sql}
							onrun={run}
							rows={12}
							datasource={draft.datasource}
						/>
					</Tab>
					<!-- sized by the query editor, so long SQL scrolls instead of growing the section -->
					<Tab label="Generated SQL" class="relative">
						<div class="absolute inset-0 overflow-auto p-3">
							<pre
								class="min-h-full rounded-md bg-surface-2 p-3 font-mono text-xs break-words whitespace-pre-wrap text-fg-2">{result?.sql ??
									'Run the query to see the generated SQL'}</pre>
						</div>
					</Tab>
				</Tabs>
			{/if}
		</div>

		<!-- options -->
		<aside
			class="w-full shrink-0 overflow-auto border-line bg-surface max-lg:border-t lg:w-80 lg:border-l"
		>
			<div class="flex flex-col gap-5 p-4">
				<section>
					<h3 class="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
						Visualization
					</h3>
					<div class="grid grid-cols-4 gap-1.5">
						{#each types as type (type)}
							{@const Icon = PANEL_TYPE_ICONS[type]}
							<button
								type="button"
								class={[
									'flex cursor-pointer flex-col items-center gap-1 rounded-md border px-1 py-2 text-[11px] transition-colors',
									draft.type === type
										? 'border-accent bg-accent/10 text-fg'
										: 'border-line text-fg-2 hover:border-line-strong hover:bg-surface-2'
								]}
								onclick={() => pickType(type)}
							>
								<Icon class="size-4" />
								{PANEL_TYPE_LABELS[type]}
							</button>
						{/each}
					</div>
					{#if templateGroups.length}
						<Field label="Template" class="mt-3" hint="Replaces the query and options">
							<Select value={template} onchange={(e) => pickTemplate(e.currentTarget.value)}>
								<option value="" disabled>Start from a template…</option>
								{#each templateGroups as group (group.label)}
									{#if group.label}
										<optgroup label={group.label}>
											{#each group.templates as t (t.id)}<option value={t.id}>{t.name}</option
												>{/each}
										</optgroup>
									{:else}
										{#each group.templates as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
									{/if}
								{/each}
							</Select>
						</Field>
					{/if}
				</section>

				{#if draft.type === 'text'}
					<section class="flex flex-col gap-3">
						<h3 class="text-xs font-semibold tracking-wide text-muted uppercase">Text</h3>
						<Field
							label="Content"
							hint="Supports # headings, **bold**, *italic*, `code`, [links](https://…) and - lists"
						>
							<Textarea rows={10} mono bind:value={draft.options.content} />
						</Field>
					</section>
				{/if}

				{#if draft.type === 'timeseries'}
					<section class="flex flex-col gap-3">
						<h3 class="text-xs font-semibold tracking-wide text-muted uppercase">Graph styles</h3>
						<div class="grid grid-cols-3 gap-1">
							{#each ['line', 'bars', 'points'] as const as style (style)}
								<Button
									size="sm"
									active={draft.options.drawStyle === style}
									variant="secondary"
									onclick={() => (draft.options.drawStyle = style)}
								>
									{style}
								</Button>
							{/each}
						</div>
						{#if draft.options.drawStyle === 'line'}
							<Field label="Line width ({draft.options.lineWidth})">
								<input
									type="range"
									min="1"
									max="6"
									step="1"
									bind:value={draft.options.lineWidth}
									class="accent-accent"
								/>
							</Field>
						{/if}
						<Field label="Fill opacity ({draft.options.fillOpacity}%)">
							<input
								type="range"
								min="0"
								max="100"
								step="5"
								bind:value={draft.options.fillOpacity}
								class="accent-accent"
							/>
						</Field>
						<Switch label="Stack series" bind:checked={draft.options.stacking} />
						<Switch
							label="Show legend"
							checked={draft.options.legend === 'list'}
							onchange={(c) => (draft.options.legend = c ? 'list' : 'hidden')}
						/>
					</section>
				{/if}

				{#if draft.type === 'stat' || draft.type === 'gauge' || draft.type === 'bar' || draft.type === 'pie'}
					<section class="flex flex-col gap-3">
						{@render columnsHeading('Value')}
						{#if draft.type === 'stat' || draft.type === 'gauge'}
							<Field label="Calculation" hint="How rows are reduced to one value">
								<Select bind:value={draft.options.reduce}>
									{#each REDUCERS as r (r)}<option value={r}>{r}</option>{/each}
								</Select>
							</Field>
						{/if}
						<Field label="Value column">
							<Select bind:value={draft.options.valueColumn}>
								<option value="">First numeric column</option>
								{#each numericColumns as c (c.name)}<option value={c.name}>{c.name}</option>{/each}
							</Select>
						</Field>
						{#if draft.type === 'stat'}
							<Field label="Color mode">
								<Select bind:value={draft.options.colorMode}>
									<option value="value">Value</option>
									<option value="background">Background</option>
									<option value="none">None</option>
								</Select>
							</Field>
							<Switch
								label="Sparkline (needs a time column)"
								bind:checked={draft.options.sparkline}
							/>
						{/if}
						{#if draft.type === 'bar'}
							<Field label="Orientation">
								<Select bind:value={draft.options.orientation}>
									<option value="horizontal">Horizontal</option>
									<option value="vertical">Vertical</option>
								</Select>
							</Field>
						{/if}
					</section>
				{/if}

				{#if draft.type === 'timeseries' || draft.type === 'bar' || draft.type === 'pie'}
					<section class="flex flex-col gap-3">
						{@render columnsHeading('Labels & colors')}
						<Field label="Label column">
							<Select bind:value={draft.options.labelColumn}>
								<option value=""
									>{draft.type === 'timeseries' ? 'All text columns' : 'First text column'}</option
								>
								{#each labelColumns as c (c.name)}<option value={c.name}>{c.name}</option>{/each}
								{#if draft.options.labelColumn && !labelColumns.some((c) => c.name === draft.options.labelColumn)}
									<option value={draft.options.labelColumn}
										>{draft.options.labelColumn} (missing)</option
									>
								{/if}
							</Select>
						</Field>
						<Field label="Color by">
							<Select bind:value={draft.options.colorBy}>
								<option value="">{draft.type === 'bar' ? 'Single color' : 'Series label'}</option>
								{#each labelColumns as c (c.name)}<option value={c.name}>{c.name}</option>{/each}
								{#if draft.options.colorBy && !labelColumns.some((c) => c.name === draft.options.colorBy)}
									<option value={draft.options.colorBy}>{draft.options.colorBy} (missing)</option>
								{/if}
							</Select>
						</Field>
					</section>
				{/if}

				{#if draft.type === 'logs'}
					<section class="flex flex-col gap-3">
						{@render columnsHeading('Columns')}
						{#each [{ key: 'levelColumn', label: 'Level column', none: 'None' }, { key: 'labelColumn', label: 'Label column', none: 'None' }, { key: 'messageColumn', label: 'Message column', none: 'First other text column' }] as const as { key, label, none } (key)}
							<Field {label}>
								<Select bind:value={draft.options[key]}>
									<option value="">{none}</option>
									{#each textColumns as c (c.name)}<option value={c.name}>{c.name}</option>{/each}
									{#if draft.options[key] && !textColumns.some((c) => c.name === draft.options[key])}
										<option value={draft.options[key]}>{draft.options[key]} (missing)</option>
									{/if}
								</Select>
							</Field>
						{/each}
					</section>
				{/if}

				{#if usesQuery(draft.type) && draft.type !== 'logs'}
					<section class="flex flex-col gap-3">
						<h3 class="text-xs font-semibold tracking-wide text-muted uppercase">
							Standard options
						</h3>
						<Field label="Unit">
							<Select bind:value={draft.field.unit}>
								{#each UNITS as u (u)}<option value={u}>{UNIT_LABELS[u]}</option>{/each}
							</Select>
						</Field>
						<div class="grid grid-cols-3 gap-2">
							<Field label="Decimals">
								<Input
									type="number"
									min="0"
									max="10"
									placeholder="auto"
									value={draft.field.decimals ?? ''}
									oninput={(e) =>
										(draft.field.decimals =
											e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
								/>
							</Field>
							<Field label="Min">
								<Input
									type="number"
									placeholder="auto"
									value={draft.field.min ?? ''}
									oninput={(e) =>
										(draft.field.min =
											e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
								/>
							</Field>
							<Field label="Max">
								<Input
									type="number"
									placeholder="auto"
									value={draft.field.max ?? ''}
									oninput={(e) =>
										(draft.field.max =
											e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
								/>
							</Field>
						</div>
					</section>
				{/if}

				{#if draft.type === 'stat' || draft.type === 'gauge'}
					<section class="flex flex-col gap-2">
						<h3 class="text-xs font-semibold tracking-wide text-muted uppercase">Thresholds</h3>
						<ThresholdsEditor bind:thresholds={draft.field.thresholds} />
					</section>
				{/if}
			</div>
		</aside>
	</div>
</div>

<Dialog bind:open={detailsOpen} title="Title & description">
	<div class="flex flex-col gap-3">
		<Field label="Title"><Input bind:value={draft.title} /></Field>
		<Field label="Description" hint="Shown as a tooltip next to the title">
			<Textarea rows={3} bind:value={draft.description} />
		</Field>
	</div>
	{#snippet footer()}
		<Button variant="primary" onclick={() => (detailsOpen = false)}>Done</Button>
	{/snippet}
</Dialog>

