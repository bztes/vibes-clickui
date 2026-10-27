<script lang="ts" module>
	/** shared by all editors and kept between openings */
	let lastTable: string | null = null;
</script>

<script lang="ts">
	import { keepPrevious } from '#lib/keep-previous.svelte.ts';
	import TableIcon from '@lucide/svelte/icons/table';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import { getColumnValues, getSchema } from '#lib/remote/query.remote.ts';
	import { columnKind } from '#lib/query/result.ts';
	import {
		arrayElement,
		columnExpr,
		isNullable,
		literal,
		mapTypes,
		quoteIdent
	} from '#lib/query/assist.ts';
	import {
		buildTemplate,
		SQL_TEMPLATES,
		templateParts,
		type ColumnType,
		type Param,
		type Ref,
		type SqlTemplate
	} from '#lib/query/sql-templates.ts';

	let {
		datasource = '',
		x,
		y,
		oninsert,
		onclose
	}: {
		datasource?: string;
		/** viewport position of the caret (bottom of the line) */
		x: number;
		y: number;
		/** gets the fragment only; keywords and separators are left to the user */
		oninsert: (text: string) => void;
		onclose: () => void;
	} = $props();

	interface Col {
		name: string;
		type: string;
	}
	interface Item {
		label: string;
		detail?: string;
		icon?: typeof TableIcon;
		checked?: boolean;
		/** more steps follow */
		next?: boolean;
		/** drawn with a line above, after the submenus */
		divider?: boolean;
		/** the template it previews, while choosing one */
		template?: SqlTemplate;
		/** the SQL it gives the placeholder asked for, previewed while highlighted; null leaves it out */
		preview?: string | null;
		select: () => void;
	}
	/** what a placeholder was given: the names or values picked, and the SQL they go in as */
	interface Pick {
		raw: string[];
		sql: string;
		/** a map column narrowed to one of its keys, `col['key']` */
		key?: string;
	}
	/** a map column picked for a column placeholder, asking for one of its keys */
	interface KeyStep {
		p: Param;
		c: Col;
		map: { key: string; value: string };
		/** only a key of it fits the placeholder's type, not the whole map */
		required: boolean;
	}

	/** the groups listed first, in this order; any others follow by name */
	const ORDER = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'Value', 'Macro'];
	const rank = (g: string) => (ORDER.includes(g) ? ORDER.indexOf(g) : ORDER.length);
	const pathOf = (t: SqlTemplate) => t.group.split('/');
	/** the templates of a group and its submenus */
	const under = (path: string[]) =>
		SQL_TEMPLATES.filter((t) => path.every((g, i) => pathOf(t)[i] === g));
	const inGroup = (path: string[]) => SQL_TEMPLATES.filter((t) => t.group === path.join('/'));
	/** the submenus right below a group; the top-level groups for none */
	const submenus = (path: string[]) =>
		[...new Set(under(path).flatMap((t) => pathOf(t)[path.length] ?? []))].sort(
			(a, b) => rank(a) - rank(b) || a.localeCompare(b)
		);

	/** the group open, with its submenus; empty while choosing one */
	let path = $state<string[]>([]);
	let chosen = $state<SqlTemplate | null>(null);
	/** by placeholder name; null when skipped */
	let picks = $state<Record<string, Pick | null>>({});
	let picked = $state<string[]>([]);
	let keyStep = $state<KeyStep | null>(null);
	let filter = $state('');
	let search = $state('');
	let active = $state(-1);
	/** undoes the choices for ⌫; automatic ones are undone together with the one before them */
	const history: { undo: () => void; auto: boolean }[] = [];

	const schema = $derived(getSchema(datasource));

	/** what each placeholder got so far, and the one asked for next */
	const resolved = $derived.by(() => {
		const values: Record<string, Pick | null> = {};
		for (const p of chosen?.params ?? []) {
			const deps = [p.table, p.column].map((r) => r && 'param' in r && r.param);
			if (p.key) deps.push(p.key);
			// left out along with what it uses
			if (deps.some((d) => d && values[d] === null)) values[p.name] = null;
			else if (p.name in picks) values[p.name] = picks[p.name];
			else return { values, pending: p };
		}
		return { values, pending: null };
	});
	const pending = $derived(resolved.pending);
	const refValue = (r?: Ref) => r && ('fixed' in r ? r.fixed : resolved.values[r.param]?.raw[0]);

	const step = $derived(
		!path.length
			? 'group'
			: !chosen
				? 'template'
				: keyStep
					? 'mapkey'
					: pending
						? pending.select
						: 'done'
	);

	const columnsOf = (table?: string): Col[] =>
		(schema.current ?? []).find((t) => t.name === table)?.columns ?? [];
	const fits = (type: string, t: ColumnType): boolean => {
		if (t === 'any') return true;
		const map = mapTypes(type);
		if (t === 'map') return !!map;
		const own =
			t === 'array'
				? !!arrayElement(type)
				: t === 'nullable'
					? isNullable(type)
					: columnKind(type) === t;
		// a key of the map can stand in for the column
		return own || (!!map && fits(map.value, t));
	};

	/** the last table picked comes first; across openings, the query itself is never read */
	const tables = $derived.by(() => {
		const all = schema.current ?? [];
		const last = all.find((t) => t.name === lastTable);
		return last ? [last, ...all.filter((t) => t !== last)] : all;
	});
	/** only tables with the columns the placeholders using it need */
	function tableChoices(p: Param) {
		const needs = (chosen?.params ?? []).filter(
			(q) => !q.optional && q.table && 'param' in q.table && q.table.param === p.name
		);
		return tables.filter((t) =>
			needs.every((q) => {
				if (q.select === 'column') return t.columns.some((c) => fits(c.type, q.type));
				const fixed = q.column && 'fixed' in q.column ? q.column.fixed : undefined;
				return fixed === undefined || t.columns.some((c) => c.name === fixed);
			})
		);
	}
	const columnChoices = (p: Param) =>
		columnsOf(refValue(p.table)).filter((c) => fits(c.type, p.type));

	/** the column a map key or value placeholder lists from, and the type of what it gets */
	const lookup = $derived.by(() => {
		if (keyStep) {
			const table = refValue(keyStep.p.table);
			if (!table) return null;
			const { c, map } = keyStep;
			return { table, column: c.name, key: undefined, mode: 'keys' as const, type: map.key };
		}
		if (pending?.select !== 'mapkey' && pending?.select !== 'value') return null;
		const table = refValue(pending.table);
		const column = refValue(pending.column);
		if (!table || !column) return null;
		const type = columnsOf(table).find((c) => c.name === column)?.type ?? '';
		// a key placeholder, or the key the map column was narrowed to
		const key = pending.key
			? resolved.values[pending.key]?.raw[0]
			: pending.column && 'param' in pending.column
				? resolved.values[pending.column.param]?.key
				: undefined;
		const map = mapTypes(type);
		return {
			table,
			column,
			key,
			mode: pending.select === 'mapkey' ? ('keys' as const) : ('values' as const),
			type:
				pending.select === 'mapkey'
					? (map?.key ?? 'String')
					: key !== undefined
						? (map?.value ?? 'String')
						: (arrayElement(type) ?? type)
		};
	});

	// the server filters by the search text too, so rare values can still be found
	$effect(() => {
		const f = filter;
		const t = setTimeout(() => (search = f), 250);
		return () => clearTimeout(t);
	});
	const values = $derived(
		lookup
			? getColumnValues({
					datasource,
					table: lookup.table,
					column: lookup.column,
					mode: lookup.mode,
					key: lookup.key,
					search
				})
			: undefined
	);
	const latestValues = keepPrevious(() => values?.current?.values);
	const valueList = $derived(latestValues.current ?? []);

	const matches = (s: string) => s.toLowerCase().includes(filter.trim().toLowerCase());

	function choose(apply: () => void, undo: () => void, auto = false) {
		apply();
		history.push({ undo, auto });
		if (auto) return;
		filter = '';
		search = '';
		active = -1;
		picked = [];
		latestValues.reset();
		autoPick();
		if (step === 'done' && chosen) {
			const sql = Object.entries(resolved.values).map(([name, v]) => [name, v?.sql ?? null]);
			oninsert(buildTemplate(chosen.sql, Object.fromEntries(sql)));
		}
	}

	const give = (p: Param, pick: Pick | null, auto = false) =>
		choose(
			() => (picks[p.name] = pick),
			() => delete picks[p.name],
			auto
		);
	/** a map column for any but a map placeholder asks for one of its keys next */
	function pickColumn(p: Param, c: Col, auto = false) {
		const map = p.type !== 'map' && mapTypes(c.type);
		if (!map) return give(p, { raw: [c.name], sql: quoteIdent(c.name) }, auto);
		const k = { p, c, map, required: p.type !== 'any' };
		choose(
			() => (keyStep = k),
			() => (keyStep = null),
			auto
		);
	}
	/** null keeps the whole map */
	function pickKey(k: KeyStep, key: string | null) {
		const pick: Pick =
			key === null
				? { raw: [k.c.name], sql: quoteIdent(k.c.name) }
				: { raw: [k.c.name], sql: columnExpr(k.c.name, { key, keyType: k.map.key }), key };
		choose(
			() => {
				picks[k.p.name] = pick;
				keyStep = null;
			},
			() => {
				delete picks[k.p.name];
				keyStep = k;
			}
		);
	}
	const pickValues = (p: Param, vals: string[]) =>
		give(p, { raw: vals, sql: vals.map((v) => literal(v, lookup?.type ?? 'String')).join(', ') });

	/** nothing to choose from a single column of the asked type, or from none when it can be skipped */
	function autoPick() {
		while (schema.current && !keyStep && pending?.select === 'column' && pending.type !== 'any') {
			const choices = columnChoices(pending);
			if (choices.length === 1) pickColumn(pending, choices[0], true);
			else if (!choices.length && pending.optional) give(pending, null, true);
			else break;
		}
	}

	function toggle(p: Param, v: string) {
		if (p.multiple) {
			picked = picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v];
			filter = '';
		} else pickValues(p, [v]);
	}

	function back() {
		active = -1;
		if (picked.length) {
			picked = [];
			return;
		}
		while (history.at(-1)?.auto) history.pop()!.undo();
		const last = history.pop();
		if (last) last.undo();
		else path = path.slice(0, -1);
	}

	const shortType = (t: string) => t.replace(/LowCardinality\(([^()]*)\)/g, '$1');
	/** more steps follow the placeholder */
	const after = (p: Param) => chosen?.params.at(-1) !== p;

	const TITLES = { table: 'Table', column: 'Column', mapkey: 'Map key', value: 'Value' };
	const describe = (p: Param) =>
		p.label ??
		`${TITLES[p.select]}${p.type === 'any' ? '' : ` (${p.type})`}${p.for ? '' : ` · ${p.name}`}`;

	const items = $derived.by((): Item[] => {
		const list: Item[] = [];
		const p = pending;
		const groups = submenus(path)
			// a search within a group lists the templates of its submenus instead
			.filter((g) => (step === 'group' ? matches(g) : !filter))
			.map((g): Item => {
				const names = under([...path, g]).map((t) => t.name);
				return {
					label: g,
					// a submenu among templates only says how many it has
					detail: path.length
						? `${names.length} templates`
						: names.slice(0, 3).join(', ') + (names.length > 3 ? ', …' : ''),
					next: true,
					select: () =>
						choose(
							() => (path = [...path, g]),
							() => (path = path.slice(0, -1))
						)
				};
			});
		if (step === 'group') return groups;
		if (step === 'template') {
			// submenus on top while not searching; a search looks into the submenus too
			const all = filter ? under(path) : inGroup(path);
			const templates = all
				.filter((t) => matches(t.name))
				.map((t): Item => ({
					label: t.name,
					detail: t.description,
					next: t.params.length > 0,
					template: t,
					select: () =>
						choose(
							() => (chosen = t),
							() => (chosen = null)
						)
				}));
			if (groups.length && templates.length) templates[0].divider = true;
			return [...groups, ...templates];
		}
		if (keyStep) {
			const k = keyStep;
			const expr = (key: string) => columnExpr(k.c.name, { key, keyType: k.map.key });
			if (!k.required && !filter) {
				list.push({
					label: 'whole map',
					detail: 'no key',
					next: after(k.p),
					preview: quoteIdent(k.c.name),
					select: () => pickKey(k, null)
				});
			}
			const typed = filter.trim();
			if (typed && !valueList.some((v) => v.value === typed)) {
				list.push({
					label: `“${typed}”`,
					detail: 'as typed',
					next: after(k.p),
					preview: expr(typed),
					select: () => pickKey(k, typed)
				});
			}
			for (const v of valueList.filter((v) => matches(v.value))) {
				list.push({
					label: v.value === '' ? '(empty)' : v.value,
					detail: v.count.toLocaleString(),
					next: after(k.p),
					preview: expr(v.value),
					select: () => pickKey(k, v.value)
				});
			}
			return list;
		}
		if (!p) return list;
		if (p.optional && !filter) {
			list.push({
				label: 'none',
				detail: `leave out ${p.for ?? p.name}`,
				next: after(p),
				preview: null,
				select: () => give(p, null)
			});
		}
		if (p.select === 'table') {
			for (const t of tableChoices(p).filter((t) => matches(t.name))) {
				list.push({
					label: t.name,
					icon: TableIcon,
					next: after(p),
					preview: quoteIdent(t.name),
					select: () => {
						lastTable = t.name;
						give(p, { raw: [t.name], sql: quoteIdent(t.name) });
					}
				});
			}
		} else if (p.select === 'column') {
			for (const c of columnChoices(p).filter((c) => matches(c.name))) {
				list.push({
					label: c.name,
					detail: shortType(c.type),
					next: after(p),
					preview: quoteIdent(c.name),
					select: () => pickColumn(p, c)
				});
			}
		} else {
			const sql = (vals: string[]) =>
				vals.map((v) => literal(v, lookup?.type ?? 'String')).join(', ');
			if (picked.length) {
				list.push({
					label: `Insert ${picked.length} value${picked.length > 1 ? 's' : ''}`,
					detail: 'Ctrl+↵',
					icon: CheckIcon,
					preview: sql(picked),
					select: () => pickValues(p, picked)
				});
			}
			const pick = (v: string) =>
				p.select === 'mapkey'
					? give(p, { raw: [v], sql: literal(v, lookup?.type ?? 'String') })
					: toggle(p, v);
			// what the placeholder gets once it is picked, or toggled in or out
			const result = (v: string) =>
				sql(
					!p.multiple ? [v] : picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v]
				);
			const next = p.select === 'mapkey' && after(p);
			const typed = filter.trim();
			if (typed && !valueList.some((v) => v.value === typed)) {
				list.push({
					label: `“${typed}”`,
					detail: 'as typed',
					next,
					preview: result(typed),
					select: () => pick(typed)
				});
			}
			for (const v of valueList.filter((v) => matches(v.value))) {
				list.push({
					label: v.value === '' ? '(empty)' : v.value,
					detail: v.count.toLocaleString(),
					checked: picked.includes(v.value),
					next,
					preview: result(v.value),
					select: () => pick(v.value)
				});
			}
		}
		return list;
	});

	/** `active` kept within the list when it shrinks; -1 while none is */
	const highlighted = $derived(Math.min(active, items.length - 1));

	/** the highlighted template while choosing one, else the chosen one, filled in as far as it is */
	const preview = $derived.by(() => {
		const t = step === 'template' ? items[highlighted]?.template : chosen;
		if (!t) return null;
		const values: Record<string, string | null> = {};
		if (t === chosen) {
			for (const [name, v] of Object.entries(resolved.values)) values[name] = v?.sql ?? null;
		}
		// one added for a placeholder stands in for it, but only leaving it out shows
		const target = pending && (pending.for ?? pending.name);
		const live = items[highlighted]?.preview;
		if (target && live !== undefined && (!pending.for || live === null)) values[target] = live;
		const name = (n: string) => {
			const p = t.params.find((p) => p.name === n);
			return p?.label ?? n;
		};
		return templateParts(t.sql, values).map((part) => ({
			...part,
			name: part.param && name(part.param),
			active: !!part.param && part.param === target
		}));
	});

	const placeholder = $derived(
		keyStep
			? `Map key · ${keyStep.c.name}`
			: pending
				? describe(pending)
				: step === 'template'
					? path.join(' › ')
					: 'Insert'
	);

	function keydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') active = (highlighted + 1) % Math.max(1, items.length);
		else if (e.key === 'ArrowUp') active = highlighted > 0 ? highlighted - 1 : items.length - 1;
		else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && pending && picked.length)
			pickValues(pending, picked);
		else if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) items[highlighted]?.select();
		else if (e.key === 'Backspace' && !filter && step !== 'group') back();
		else if (e.key === 'Escape') onclose();
		else return;
		e.preventDefault();
		e.stopPropagation();
	}

	let list = $state<HTMLElement>();
	$effect(() => {
		list?.querySelector(`[data-index="${highlighted}"]`)?.scrollIntoView({ block: 'nearest' });
	});
	let previewEl = $state<HTMLElement>();
	$effect(() => {
		void preview;
		previewEl?.querySelector('mark')?.scrollIntoView({ block: 'nearest' });
	});

	// flip above the caret when there is no room below
	let height = $state(0);
	const top = $derived(y + height + 8 > innerHeight ? Math.max(8, y - height - 24) : y + 4);
	const left = $derived(Math.max(8, Math.min(x, innerWidth - 344)));
</script>

<div
	popover="manual"
	{@attach (el) => el.showPopover()}
	bind:offsetHeight={height}
	style:top="{top}px"
	style:left="{left}px"
	class="fixed inset-auto m-0 flex w-84 flex-col overflow-hidden rounded-lg border border-line bg-surface p-0 text-fg shadow-xl"
	onfocusout={(e) => {
		if (!e.currentTarget.contains(e.relatedTarget as Node)) onclose();
	}}
>
	<div class="flex items-center gap-2 border-b border-line px-2">
		<input
			{@attach (el) => el.focus()}
			bind:value={filter}
			onkeydown={keydown}
			oninput={() => (active = -1)}
			{placeholder}
			spellcheck="false"
			autocomplete="off"
			class="h-8 min-w-0 flex-1 bg-transparent font-mono text-[13px] outline-none placeholder:font-sans placeholder:text-muted"
		/>
		{#if values?.loading || schema.loading}<Spinner class="size-3.5" />{/if}
	</div>
	{#if pending?.help}
		<p class="border-b border-line px-2 py-1 text-[11px] text-fg-2">{pending.help}</p>
	{/if}
	<!-- keep focus in the input while clicking items -->
	<div
		bind:this={list}
		role="listbox"
		tabindex="-1"
		class="max-h-72 overflow-auto p-1"
		onpointerdown={(e) => e.preventDefault()}
	>
		{#each items as item, i (i)}
			{#if item.divider}<hr class="mx-1 my-1 border-line" />{/if}
			<button
				type="button"
				role="option"
				aria-selected={i === highlighted}
				data-index={i}
				tabindex="-1"
				class={[
					'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-xs',
					i === highlighted ? 'bg-surface-3' : 'hover:bg-surface-2'
				]}
				onclick={() => item.select()}
			>
				{#if item.icon}<item.icon class="size-3.5 shrink-0 text-muted" />{/if}
				{#if item.checked !== undefined && pending?.multiple}
					<span
						class={[
							'grid size-3.5 shrink-0 place-items-center rounded-sm border',
							item.checked ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong'
						]}
					>
						{#if item.checked}<CheckIcon class="size-2.5" />{/if}
					</span>
				{/if}
				<!-- the name keeps its room; the detail gets what is left -->
				<span class="max-w-4/5 shrink-0 truncate font-mono">{item.label}</span>
				{#if item.detail}
					<span class="min-w-0 flex-1 truncate pl-2 text-right text-[10px] text-muted"
						>{item.detail}</span
					>
				{/if}
				{#if item.next}<ChevronRightIcon class="size-3 shrink-0 text-muted" />{/if}
			</button>
		{:else}
			<p class="px-2 py-1.5 text-xs text-muted">
				{#if values?.current?.error}{values.current.error}
				{:else if values?.loading || schema.loading}Loading…
				{:else}Nothing found{/if}
			</p>
		{/each}
	</div>
	{#if preview}
		<div
			bind:this={previewEl}
			class="max-h-28 overflow-auto border-t border-line bg-surface-2 px-2 py-1.5 font-mono text-[11px] break-words whitespace-pre-wrap text-muted"
		>
			{#each preview as part, i (i)}
				{#if !part.param}{part.text}{:else if part.active}<mark
						class="rounded-sm bg-accent/20 px-0.5 text-accent ring-1 ring-accent/50"
						>{part.text || part.name}</mark
					>{:else if part.text}<span class="text-fg">{part.text}</span>{:else}<span
						class="rounded-sm bg-surface-3 px-0.5 text-fg-2 italic">{part.name}</span
					>{/if}
			{/each}
		</div>
	{/if}
	<div class="border-t border-line px-2 py-1 text-[10px] text-muted">
		↑↓ choose · ↵ select{pending?.multiple ? ' / toggle · Ctrl+↵ insert' : ''} · ⌫ back · Esc close
	</div>
</div>
