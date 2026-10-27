import { describe, expect, it } from 'vitest';
import {
	buildTemplate,
	parseTemplate,
	SQL_TEMPLATES,
	template as load,
	templateParts,
	type Var
} from './sql-templates.ts';

const template = (id: string) => SQL_TEMPLATES.find((t) => t.id === id)!;
const latestRows = {
	sql: 'SELECT *\nFROM {table}[[\nWHERE $__timeFilter({time})\nORDER BY {time} DESC]]\nLIMIT 100',
	vars: {
		table: { select: 'table' },
		time: { select: 'column', type: 'time', use: 'table' }
	}
} satisfies { sql: string; vars: Record<string, Var> };
const asked = (sql: string, vars: Record<string, Var>) =>
	parseTemplate(sql, vars).map((p) => {
		const ref = (r?: { param: string } | { fixed: string }) =>
			r && ('param' in r ? r.param : `=${r.fixed}`);
		return [p.name, p.select, p.type, ref(p.table), ref(p.column)].filter(Boolean).join(' ');
	});

describe('sql templates', () => {
	it('loads one template per file, by group', () => {
		expect(template('core/macro/interval-s').params).toEqual([]);
		expect(template('core/macro/time-filter').params.map((p) => p.name)).toEqual([
			'col.table',
			'col'
		]);
		// the template says what it needs, so it is picked before the column
		expect(template('core/select/avg').params.at(-1)).toMatchObject({
			select: 'column',
			type: 'number'
		});
		expect(new Set(SQL_TEMPLATES.map((t) => t.group))).toEqual(
			new Set(['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'Value', 'Macro'])
		);
	});

	it('fills in a where condition', () => {
		const { sql } = template('core/where/in');
		expect(buildTemplate(sql, { col: "Attrs['a']", values: "'x', 'y'" })).toBe(
			"Attrs['a'] IN ('x', 'y')"
		);
	});

	it('asks for what is used first', () => {
		expect(
			asked('{t} {d} {u}', {
				t: { select: 'table' },
				d: { select: 'column', type: 'map', use: 't' },
				u: { select: 'mapkey', use: 'd' }
			})
		).toEqual(['t table any', 'd column map t', 'u mapkey any t d']);
		// appears after the one using it
		expect(asked('{c} {t}', { c: { select: 'column', use: 't' }, t: { select: 'table' } })).toEqual(
			['t table any', 'c column any t']
		);
		// not in the SQL at all
		expect(asked('{c}', { t: { select: 'table' }, c: { select: 'column', use: 't' } })).toEqual([
			't table any',
			'c column any t'
		]);
	});

	it('asks for what is left out', () => {
		expect(asked('{c}', { c: { select: 'column' } })).toEqual([
			'c.table table any',
			'c column any c.table'
		]);
		expect(asked('{t} {k}', { t: { select: 'table' }, k: { select: 'mapkey', use: 't' } })).toEqual(
			['t table any', 'k.column column map t', 'k mapkey any t k.column']
		);
		expect(asked('{k}', { k: { select: 'mapkey' } })).toEqual([
			'k.table table any',
			'k.column column map k.table',
			'k mapkey any k.table k.column'
		]);
		expect(asked('{k}', { k: { select: 'mapkey', table: 'foobar' } })).toEqual([
			'k.column column map =foobar',
			'k mapkey any =foobar k.column'
		]);
		expect(
			asked('{k}', { k: { select: 'mapkey', table: 'foobar', column: 'attributes' } })
		).toEqual(['k mapkey any =foobar =attributes']);
		expect(
			asked('{c} {k} {t}', {
				c: { select: 'column', use: 't' },
				k: { select: 'mapkey', use: 'c' },
				t: { select: 'table' }
			})
		).toEqual(['t table any', 'c column map t', 'k mapkey any t c']);
	});

	it('can skip what only appears inside [[…]]', () => {
		const c: Record<string, Var> = { c: { select: 'column' } };
		const [table, col] = parseTemplate('SELECT 1[[, {c}]]', c);
		expect(table.optional && table.for === 'c' && col.optional).toBe(true);
		expect(parseTemplate('[[{c}]] {c}', c)[1].optional).toBe(false);
		expect(parseTemplate(latestRows.sql, latestRows.vars).map((p) => [p.name, p.optional])).toEqual(
			[
				['table', false],
				['time', true]
			]
		);
		const tc: Record<string, Var> = { t: { select: 'table' }, c: { select: 'column', use: 't' } };
		expect(() => parseTemplate('[[{t}]] {c}', tc)).toThrow(/only inside/);
		// one that isn't in the SQL can be skipped when everything using it can
		expect(parseTemplate('[[{c}]]', tc).map((p) => p.optional)).toEqual([true, true]);
		expect(parseTemplate('[[{c}]] {c}', tc).map((p) => p.optional)).toEqual([false, false]);
	});

	it('takes values of a map key', () => {
		const [, , key, value] = parseTemplate('{m} {k} {v}', {
			m: { select: 'column', type: 'map' },
			k: { select: 'mapkey', use: 'm' },
			v: { select: 'value', use: 'k', multiple: true }
		});
		expect(key.name).toBe('k');
		expect(value).toMatchObject({ key: 'k', column: { param: 'm' }, multiple: true });
	});

	it('rejects invalid templates', () => {
		const vars = (vars: Record<string, unknown>) =>
			load('test', { group: 'X', name: 'x', sql: '{x}', vars } as Parameters<typeof load>[1]);
		expect(() => parseTemplate('{x}')).toThrow(/not defined/);
		expect(() => vars({ x: { select: 'foo' } })).toThrow(/select/);
		expect(() => vars({ x: { select: 'table', colour: 'red' } })).toThrow(/colour/);
		expect(() => vars({ x: { select: 'table', optional: true } })).toThrow(/optional/);
		expect(() => vars({ x: { select: 'table' }, y: { select: 'table' } })).toThrow(/never used/);
		expect(() =>
			parseTemplate('{x} {y}', { x: { select: 'table', use: 'y' }, y: { select: 'table' } })
		).toThrow();
		expect(() => parseTemplate('{x}', { x: { select: 'column', use: 'x' } })).toThrow(/itself/);
		expect(() => parseTemplate('{x}', { x: { select: 'table', type: 'time' } })).toThrow(/type/);
		expect(() =>
			parseTemplate('{c} {k}', {
				c: { select: 'column', type: 'time' },
				k: { select: 'mapkey', use: 'c' }
			})
		).toThrow(/map column/);
	});

	it('fills in the values', () => {
		const sql = 'SELECT {c} FROM {t} ORDER BY {c}';
		expect(buildTemplate(sql, { t: '`my-table`', c: 'a' })).toBe(
			'SELECT a FROM `my-table` ORDER BY a'
		);
	});

	it('drops sections whose placeholders are unset', () => {
		const { sql } = latestRows;
		expect(buildTemplate(sql, { table: 'events', time: null })).toBe(
			'SELECT *\nFROM events\nLIMIT 100'
		);
		expect(buildTemplate(sql, { table: 'events', time: 'ts' })).toBe(
			'SELECT *\nFROM events\nWHERE $__timeFilter(ts)\nORDER BY ts DESC\nLIMIT 100'
		);
	});

	it('leaves other braces alone', () => {
		const sql = "SELECT {x:String}, '{', {t}";
		expect(parseTemplate(sql, { t: { select: 'table', label: 'A (table)' } })[0].label).toBe(
			'A (table)'
		);
		expect(buildTemplate(sql, { t: 't' })).toBe("SELECT {x:String}, '{', t");
	});

	it('describes the placeholders', () => {
		const t = load('test', {
			group: 'X',
			name: 'x',
			sql: '{c}',
			vars: { c: { select: 'column', description: 'the column' } }
		});
		expect(t.params.map((p) => p.help)).toEqual([undefined, 'the column']);
	});

	it('splits a template for its preview', () => {
		const { sql } = latestRows;
		const parts = templateParts(sql, { table: 'events' });
		expect(parts.filter((p) => p.param)).toEqual([
			{ text: 'events', param: 'table' },
			{ text: '', param: 'time' },
			{ text: '', param: 'time' }
		]);
		expect(parts.map((p) => p.text).join('')).toBe(
			'SELECT *\nFROM events\nWHERE $__timeFilter()\nORDER BY  DESC\nLIMIT 100'
		);
		expect(templateParts(sql, { table: 'events', time: null }).map((p) => p.text)).toEqual([
			'SELECT *\nFROM ',
			'events',
			'\nLIMIT 100'
		]);
	});
});
