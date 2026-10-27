import * as v from 'valibot';
import type { ColumnKind } from './result.ts';

/*
 * Templates are SQL with `{name}` placeholders that ask for something when the template is used. What
 * each one asks for is defined under the template's `vars`, by name:
 *
 *   "table": { "select": "table" }                                      a table
 *   "time": { "select": "column", "type": "time", "use": "table" }      a time column of that table
 *   "attrs": { "select": "column", "type": "map", "use": "table" }      a map column of that table
 *   "key": { "select": "mapkey", "use": "attrs" }                       one of its keys
 *   "key": { "select": "mapkey", "table": "events", "column": "attributes" }
 *   "v": { "select": "value", "use": "key", "multiple": true }          values of that key, comma separated
 *
 * `use` names the placeholder the choices come from, `table` and `column` fix them instead. Whatever
 * is left out is asked for too: a column without a table asks for a table first, a map key without a
 * column asks for a map column (and its table); those go by the placeholder's name and what they
 * select, `col.table`. A placeholder that only appears inside `[[…]]` sections can be skipped, which
 * leaves out those sections and everything that uses it. One that doesn't appear in the SQL at all is
 * still asked for when another one uses it. `label` names it in the menu, `description` says in a few
 * words what it is for. Braces that aren't placeholders, like `{name:String}` query parameters, are
 * left alone.
 */

export const SELECTS = ['table', 'column', 'mapkey', 'value'] as const;
export type Select = (typeof SELECTS)[number];
export const COLUMN_TYPES = [
	'any',
	'time',
	'number',
	'string',
	'bool',
	'map',
	'array',
	'nullable'
] as const;
/** a column kind, a map or array column, or one that can be NULL */
export type ColumnType = (typeof COLUMN_TYPES)[number] &
	(ColumnKind | 'any' | 'map' | 'array' | 'nullable');

/** where a table or column comes from: another placeholder, or fixed by the template */
export type Ref = { param: string } | { fixed: string };

export interface Param {
	name: string;
	select: Select;
	/** the columns offered by a column placeholder */
	type: ColumnType;
	/** for columns, map keys and values */
	table?: Ref;
	/** for map keys and values */
	column?: Ref;
	/** for values of one map key: the map key placeholder */
	key?: string;
	/** only appears inside `[[…]]` sections, so it can be skipped */
	optional: boolean;
	/** values only: lets several be picked */
	multiple: boolean;
	label?: string;
	/** a few words on what it is for, from its `description` */
	help?: string;
	/** added because a placeholder left it out; set to that placeholder's name */
	for?: string;
}

const VarSchema = v.strictObject({
	select: v.picklist(SELECTS),
	/** select:column only */
	type: v.optional(v.picklist(COLUMN_TYPES)),
	use: v.optional(v.string()),
	table: v.optional(v.string()),
	column: v.optional(v.string()),
	multiple: v.optional(v.boolean()),
	label: v.optional(v.string()),
	description: v.optional(v.string())
});
/** what a placeholder asks for, as defined under `vars` */
export type Var = v.InferOutput<typeof VarSchema>;

interface Token {
	start: number;
	end: number;
	name: string;
}

const tokens = (sql: string): Token[] =>
	[...sql.matchAll(/\{(\w+)\}/g)].map((m) => ({
		start: m.index,
		end: m.index + m[0].length,
		name: m[1]
	}));

const SECTION = /\[\[([\s\S]*?)\]\]/g;

/**
 * The placeholders of a template, in the order they are asked for: in the order they appear, with
 * the ones they use (or that were left out) before them. Throws when the template is invalid.
 */
export function parseTemplate(sql: string, vars: Record<string, Var> = {}): Param[] {
	const defs = new Map(Object.entries(vars));
	for (const t of tokens(sql)) {
		if (!defs.has(t.name)) throw new Error(`{${t.name}} is not defined in vars`);
	}
	const sections = [...sql.matchAll(SECTION)].map((m) => [m.index, m.index + m[0].length]);
	const inSql = new Set(tokens(sql).map((t) => t.name));
	const required = new Set(
		tokens(sql)
			.filter((t) => !sections.some(([from, to]) => t.start > from && t.end < to))
			.map((t) => t.name)
	);
	// one that isn't in the SQL is asked for when something uses it, and can't be skipped when that can't
	const used = new Set(inSql);
	for (let grew = true; grew;) {
		grew = false;
		for (const [name, def] of defs) {
			if (!def.use) continue;
			if (used.has(name) && !used.has(def.use)) {
				used.add(def.use);
				grew = true;
			}
			if (required.has(name) && !inSql.has(def.use) && !required.has(def.use)) {
				required.add(def.use);
				grew = true;
			}
		}
	}
	for (const name of defs.keys()) {
		if (!used.has(name)) throw new Error(`vars: ${name} is never used`);
	}

	const params: Param[] = [];
	const done = new Map<string, Param>();
	const visiting = new Set<string>();

	function implicit(owner: Param, select: Select, rest: Partial<Param>): Param {
		const p: Param = {
			name: `${owner.name}.${select}`,
			select,
			type: 'any',
			optional: owner.optional,
			multiple: false,
			for: owner.name,
			...rest
		};
		params.push(p);
		return p;
	}

	function resolve(name: string): Param {
		const found = done.get(name);
		if (found) return found;
		const def = defs.get(name);
		if (!def) throw new Error(`{${name}} is used but not defined in vars`);
		if (visiting.has(name)) throw new Error(`{${name}} uses itself`);
		visiting.add(name);
		const fail = (msg: string): never => {
			throw new Error(`{${name}}: ${msg}`);
		};

		if (def.type && def.select !== 'column') fail('type is for select:column only');
		const p: Param = {
			name,
			select: def.select,
			type: def.type ?? 'any',
			optional: !required.has(name),
			multiple: def.multiple ?? false,
			label: def.label,
			help: def.description
		};
		if (p.multiple && p.select !== 'value') fail('multiple is for select:value only');

		const use = def.use !== undefined ? resolve(def.use) : undefined;
		if (use?.optional && !p.optional) fail(`uses {${use.name}}, which is only inside [[…]]`);
		const table = def.table !== undefined ? { fixed: def.table } : undefined;
		const column = def.column !== undefined ? { fixed: def.column } : undefined;
		if (p.select === 'table') {
			if (use || table || column) fail('a table takes no use, table or column');
		} else if (p.select === 'column') {
			if (column) fail('column is for map keys and values');
			if (use && table) fail('use and table both give the table');
			if (use && use.select !== 'table') fail(`uses {${use.name}}, which isn't a table`);
			p.table = table ?? (use ? { param: use.name } : { param: implicit(p, 'table', {}).name });
		} else if (use && use.select !== 'table') {
			if (table || column) fail(`use:${use.name} gives the table and column already`);
			if (use.select === 'mapkey' && p.select === 'value') {
				p.key = use.name;
			} else if (use.select !== 'column') {
				fail(`can't use {${use.name}}, a ${use.select}`);
			} else if (p.select === 'mapkey') {
				if (use.type === 'any') use.type = 'map';
				else if (use.type !== 'map') fail(`{${use.name}} has to be a map column`);
			}
			p.table = use.table;
			p.column = p.key ? done.get(p.key)!.column : { param: use.name };
		} else {
			if (use && table) fail('use and table both give the table');
			p.table = table ?? (use ? { param: use.name } : { param: implicit(p, 'table', {}).name });
			p.column = column ?? {
				param: implicit(p, 'column', {
					type: p.select === 'mapkey' ? 'map' : 'any',
					table: p.table
				}).name
			};
		}

		visiting.delete(name);
		done.set(name, p);
		params.push(p);
		return p;
	}

	for (const t of tokens(sql)) resolve(t.name);
	for (const name of defs.keys()) resolve(name);
	return params;
}

/**
 * Fills in the placeholders with the SQL they were given. A `[[…]]` section is left out when one of
 * its placeholders has none.
 */
export function buildTemplate(sql: string, values: Record<string, string | null | undefined>) {
	const fill = (s: string) => {
		let out = '';
		let at = 0;
		for (const t of tokens(s)) {
			out += s.slice(at, t.start) + (values[t.name] ?? '');
			at = t.end;
		}
		return out + s.slice(at);
	};
	return fill(
		sql.replace(SECTION, (_, section: string) =>
			tokens(section).every((t) => values[t.name] != null) ? section : ''
		)
	);
}

/** the template split into its SQL and its placeholders, for showing it while being filled in */
export interface TemplatePart {
	text: string;
	/** the placeholder this part is; its text is empty while it has no value */
	param?: string;
}

/**
 * Like `buildTemplate`, but placeholders without a value yet stay in, marked, and a `[[…]]` section
 * is only left out once one of its placeholders is skipped.
 */
export function templateParts(
	sql: string,
	values: Record<string, string | null | undefined>
): TemplatePart[] {
	const kept = sql.replace(SECTION, (_, section: string) =>
		tokens(section).some((t) => values[t.name] === null) ? '' : section
	);
	const parts: TemplatePart[] = [];
	let at = 0;
	for (const t of tokens(kept)) {
		parts.push({ text: kept.slice(at, t.start) }, { text: values[t.name] ?? '', param: t.name });
		at = t.end;
	}
	parts.push({ text: kept.slice(at) });
	return parts.filter((p) => p.param || p.text);
}

export interface SqlTemplate {
	/** the config and the file's path within its sql folder, without `.json`, e.g. `core/select/avg` */
	id: string;
	/** the submenu it is listed in; `/` nests one, e.g. `WHERE/Logs` */
	group: string;
	name: string;
	description?: string;
	sql: string;
	params: Param[];
}

const SqlTemplateSchema = v.object({
	group: v.string(),
	name: v.string(),
	description: v.optional(v.string()),
	sql: v.string(),
	/** what each placeholder asks for, by name */
	vars: v.optional(v.record(v.string(), VarSchema))
});

/** for SQL the menu builds itself; throws when invalid */
export function template(id: string, t: v.InferInput<typeof SqlTemplateSchema>): SqlTemplate {
	try {
		const result = v.safeParse(SqlTemplateSchema, t);
		if (!result.success) {
			const first = result.issues[0];
			const path = first.path?.map((p) => p.key).join('.') ?? '';
			throw new Error(`${path ? `at ${path}: ` : ''}${first.message}`);
		}
		const { vars, ...parsed } = result.output;
		return { ...parsed, id, params: parseTemplate(parsed.sql, vars) };
	} catch (e) {
		throw new Error(`template ${id}: ${(e as Error).message}`, { cause: e });
	}
}

// the insert menu's entries live as JSON in /configs/<config>/sql, one per file, validated when loaded
const files = import.meta.glob<v.InferInput<typeof SqlTemplateSchema>>('/configs/*/sql/**/*.json', {
	eager: true,
	import: 'default'
});

export const SQL_TEMPLATES: SqlTemplate[] = Object.entries(files)
	.map(([path, json]) =>
		template(path.slice('/configs/'.length, -'.json'.length).replace('/sql/', '/'), json)
	)
	.sort((a, b) => a.name.localeCompare(b.name));
