import type { Reducer } from '#lib/dashboard/types.ts';

export type ColumnKind = 'time' | 'number' | 'string' | 'bool' | 'other';

export interface Column {
	name: string;
	type: string;
	kind: ColumnKind;
}

export interface QueryResult {
	columns: Column[];
	/** time columns are converted to epoch milliseconds */
	rows: unknown[][];
	/** the SQL after macro/variable expansion */
	sql: string;
	from: number;
	to: number;
	intervalSeconds: number;
	elapsedMs: number;
	truncated: boolean;
	error?: string;
}

/** strips `Nullable(...)` / `LowCardinality(...)` wrappers */
export function unwrapType(type: string): string {
	let t = type.trim();
	for (;;) {
		const m = /^(?:Nullable|LowCardinality)\((.*)\)$/.exec(t);
		if (!m) return t;
		t = m[1].trim();
	}
}

export function columnKind(type: string): ColumnKind {
	const t = unwrapType(type);
	if (/^(DateTime|Date)/.test(t)) return 'time';
	if (/^(U?Int|Float|Decimal)/.test(t)) return 'number';
	if (t === 'Bool') return 'bool';
	if (/^(String|FixedString|Enum|UUID|IPv)/.test(t)) return 'string';
	return 'other';
}

export function toObjects<T = Record<string, unknown>>(
	result: Pick<QueryResult, 'columns' | 'rows'>
): T[] {
	return result.rows.map(
		(row) => Object.fromEntries(result.columns.map((c, i) => [c.name, row[i]])) as T
	);
}

export interface Series {
	name: string;
	/** what the color is picked by: the `colorBy` column's value, or else the name */
	key: string;
	values: (number | null)[];
}

export interface TimeSeriesFrame {
	/** epoch seconds */
	x: number[];
	series: Series[];
}

const num = (v: unknown) => {
	if (v === null || v === undefined || v === '') return null;
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? n : null;
};

/** Index of the `colorBy` column, or -1 to color by label. */
const colorByIndex = (columns: Column[], colorBy: string) =>
	colorBy ? columns.findIndex((c) => c.name === colorBy) : -1;

type LabelOptions = { labelColumn?: string; colorBy?: string };

/**
 * Turns a result with a time column, optional label columns and numeric value columns into
 * wide series. Rows like `(time, service, value)` are pivoted into one series per service.
 * Unless a label column is picked, all text columns together name the series.
 */
export function toTimeSeries(
	result: Pick<QueryResult, 'columns' | 'rows'>,
	{ labelColumn = '', colorBy = '' }: LabelOptions = {}
): TimeSeriesFrame | null {
	const timeIdx = result.columns.findIndex((c) => c.kind === 'time');
	if (timeIdx === -1) return null;
	const valueIdx = result.columns.flatMap((c, i) =>
		c.kind === 'number' && i !== timeIdx ? [i] : []
	);
	if (valueIdx.length === 0) return null;
	const labelIdx = result.columns.flatMap((c, i) =>
		(labelColumn ? c.name === labelColumn : c.kind === 'string' || c.kind === 'bool') &&
		i !== timeIdx
			? [i]
			: []
	);

	const times = new Map<number, number>();
	const colorIdx = colorByIndex(result.columns, colorBy);
	const seriesMap = new Map<string, { key: string; values: Map<number, number | null> }>();

	for (const row of result.rows) {
		const t = row[timeIdx] as number;
		if (!times.has(t)) times.set(t, times.size);
		const label = labelIdx.map((i) => String(row[i] ?? '')).join(', ');
		for (const vi of valueIdx) {
			const name = label
				? valueIdx.length > 1
					? `${label} ${result.columns[vi].name}`
					: label
				: result.columns[vi].name;
			let s = seriesMap.get(name);
			if (!s) {
				const key = colorIdx === -1 ? name : String(row[colorIdx] ?? '');
				seriesMap.set(name, (s = { key, values: new Map() }));
			}
			s.values.set(t, num(row[vi]));
		}
	}

	const x = [...times.keys()].sort((a, b) => a - b);
	return {
		x: x.map((t) => t / 1000),
		series: [...seriesMap].map(([name, { key, values }]) => ({
			name,
			key,
			values: x.map((t) => values.get(t) ?? null)
		}))
	};
}

export function reduceValues(values: (number | null)[], reducer: Reducer): number | null {
	const v = values.filter((x): x is number => x !== null);
	if (reducer === 'count') return v.length;
	if (v.length === 0) return null;
	switch (reducer) {
		case 'first':
			return v[0];
		case 'last':
			return v[v.length - 1];
		case 'max':
			return Math.max(...v);
		case 'min':
			return Math.min(...v);
		case 'sum':
			return v.reduce((a, b) => a + b, 0);
		case 'mean':
			return v.reduce((a, b) => a + b, 0) / v.length;
	}
}

/** A single value (plus optional sparkline) for stat & gauge panels. */
export function toSingleValue(
	result: Pick<QueryResult, 'columns' | 'rows'>,
	reducer: Reducer,
	valueColumn: string
) {
	const idx = valueColumn
		? result.columns.findIndex((c) => c.name === valueColumn)
		: result.columns.findIndex((c) => c.kind === 'number');
	if (idx === -1) return { value: null, spark: [] as (number | null)[], name: '' };
	const values = result.rows.map((r) => num(r[idx]));
	const hasTime = result.columns.some((c) => c.kind === 'time');
	return {
		value: reduceValues(values, reducer),
		spark: hasTime && values.length > 1 ? values : [],
		name: result.columns[idx].name
	};
}

type CategoryOptions = LabelOptions & { valueColumn?: string };

/**
 * Label/value pairs for bar & pie charts. Unless picked, the first text column is the label
 * and the first numeric the value.
 */
export function toCategories(
	result: Pick<QueryResult, 'columns' | 'rows'>,
	{ valueColumn = '', labelColumn = '', colorBy = '' }: CategoryOptions = {}
) {
	const labelIdx = labelColumn
		? result.columns.findIndex((c) => c.name === labelColumn)
		: result.columns.findIndex((c) => c.kind !== 'number');
	const colorIdx = colorByIndex(result.columns, colorBy);
	const valueIdx = valueColumn
		? result.columns.findIndex((c) => c.name === valueColumn)
		: result.columns.findIndex((c) => c.kind === 'number');
	if (valueIdx === -1) return [];
	return result.rows.map((row, i) => {
		const label = labelIdx === -1 ? `#${i + 1}` : String(row[labelIdx] ?? '');
		return {
			label,
			key: colorIdx === -1 ? label : String(row[colorIdx] ?? ''),
			value: num(row[valueIdx]) ?? 0
		};
	});
}
