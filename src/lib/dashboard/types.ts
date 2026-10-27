import * as v from 'valibot';

export const PANEL_TYPES = [
	'timeseries',
	'bar',
	'stat',
	'gauge',
	'table',
	'pie',
	'logs',
	'text'
] as const;
export type PanelType = (typeof PANEL_TYPES)[number];

export const PANEL_TYPE_LABELS: Record<PanelType, string> = {
	timeseries: 'Time series',
	bar: 'Bar chart',
	stat: 'Stat',
	gauge: 'Gauge',
	table: 'Table',
	pie: 'Pie chart',
	logs: 'Logs',
	text: 'Text'
};

/** Panel types that render without running SQL. */
export const usesQuery = (type: PanelType) => type !== 'text';

export const UNITS = [
	'none',
	'short',
	'percent',
	'percentunit',
	'bytes',
	'decbytes',
	'ns',
	'us',
	'ms',
	's',
	'reqps',
	'ops'
] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABELS: Record<Unit, string> = {
	none: 'None',
	short: 'Short (1.2k, 3.4M)',
	percent: 'Percent (0-100)',
	percentunit: 'Percent (0.0-1.0)',
	bytes: 'Bytes (IEC)',
	decbytes: 'Bytes (SI)',
	ns: 'Nanoseconds',
	us: 'Microseconds',
	ms: 'Milliseconds',
	s: 'Seconds',
	reqps: 'Requests/sec',
	ops: 'Ops/sec'
};

/** Named colors usable in thresholds; resolved to CSS variables in the UI. */
export const COLOR_NAMES = [
	'good',
	'warning',
	'serious',
	'critical',
	'blue',
	'violet',
	'muted'
] as const;
export type ColorName = (typeof COLOR_NAMES)[number];

/** Colors a series name can be pinned to: the categorical palette in order, plus gray. */
export const SERIES_COLOR_NAMES = [
	'blue',
	'orange',
	'teal',
	'yellow',
	'pink',
	'green',
	'violet',
	'red',
	'gray'
] as const;
export type SeriesColorName = (typeof SERIES_COLOR_NAMES)[number];

export const REDUCERS = ['last', 'first', 'mean', 'max', 'min', 'sum', 'count'] as const;
export type Reducer = (typeof REDUCERS)[number];

export const REFRESH_INTERVALS = ['', '5s', '10s', '30s', '1m', '5m', '15m', '1h'] as const;

const GridPosSchema = v.object({
	x: v.pipe(v.number(), v.integer(), v.minValue(0)),
	y: v.pipe(v.number(), v.integer(), v.minValue(0)),
	w: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(24)),
	h: v.pipe(v.number(), v.integer(), v.minValue(1))
});
export type GridPos = v.InferOutput<typeof GridPosSchema>;

const ThresholdSchema = v.object({
	/** `null` is the base step that applies below every other threshold */
	value: v.nullable(v.number()),
	color: v.picklist(COLOR_NAMES)
});
export type Threshold = v.InferOutput<typeof ThresholdSchema>;

const FieldConfigSchema = v.object({
	unit: v.optional(v.picklist(UNITS), 'none'),
	decimals: v.optional(
		v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10))),
		null
	),
	min: v.optional(v.nullable(v.number()), null),
	max: v.optional(v.nullable(v.number()), null),
	thresholds: v.optional(v.array(ThresholdSchema), [
		{ value: null, color: 'good' },
		{ value: 80, color: 'critical' }
	])
});
export type FieldConfig = v.InferOutput<typeof FieldConfigSchema>;

export const PanelOptionsSchema = v.object({
	// time series
	drawStyle: v.optional(v.picklist(['line', 'bars', 'points']), 'line'),
	lineWidth: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(10)), 2),
	fillOpacity: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(100)), 10),
	stacking: v.optional(v.boolean(), false),
	legend: v.optional(v.picklist(['list', 'hidden']), 'list'),
	/** time series / pie / bar: column whose value picks the color (empty = the label) */
	colorBy: v.optional(v.string(), ''),
	/** time series / pie / bar: column that names series/slices/bars (empty = guessed); logs: shown before the message (empty = none) */
	labelColumn: v.optional(v.string(), ''),
	// stat / gauge / pie / bar
	reduce: v.optional(v.picklist(REDUCERS), 'last'),
	valueColumn: v.optional(v.string(), ''),
	sparkline: v.optional(v.boolean(), true),
	colorMode: v.optional(v.picklist(['value', 'background', 'none']), 'value'),
	// bar chart
	orientation: v.optional(v.picklist(['horizontal', 'vertical']), 'horizontal'),
	// logs
	/** column holding the log level, which colors the line (empty = none) */
	levelColumn: v.optional(v.string(), ''),
	/** column holding the log message (empty = the first other text column) */
	messageColumn: v.optional(v.string(), ''),
	// text
	content: v.optional(v.string(), '')
});
export type PanelOptions = v.InferOutput<typeof PanelOptionsSchema>;

export const PanelSchema = v.object({
	id: v.string(),
	type: v.picklist(PANEL_TYPES),
	title: v.optional(v.string(), ''),
	description: v.optional(v.string(), ''),
	/** data source id; empty means the default data source */
	datasource: v.optional(v.string(), ''),
	sql: v.optional(v.string(), ''),
	gridPos: GridPosSchema,
	field: v.optional(FieldConfigSchema, {}),
	options: v.optional(PanelOptionsSchema, {})
});
export type Panel = v.InferOutput<typeof PanelSchema>;

const VariableSchema = v.object({
	name: v.pipe(v.string(), v.regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Use letters, digits and _')),
	label: v.optional(v.string(), ''),
	type: v.picklist(['query', 'custom', 'textbox']),
	datasource: v.optional(v.string(), ''),
	/** SQL for `query`, comma separated values for `custom`, default value for `textbox` */
	query: v.optional(v.string(), ''),
	multi: v.optional(v.boolean(), false),
	includeAll: v.optional(v.boolean(), false)
});
export type Variable = v.InferOutput<typeof VariableSchema>;

/** options of a `custom` variable: its comma-separated query */
export function customOptions(variable: Variable) {
	return variable.query
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

export const DashboardModelSchema = v.object({
	panels: v.optional(v.array(PanelSchema), []),
	variables: v.optional(v.array(VariableSchema), []),
	time: v.optional(v.object({ from: v.string(), to: v.string() }), { from: 'now-1h', to: 'now' }),
	refresh: v.optional(v.picklist(REFRESH_INTERVALS), ''),
	/** series name → pinned color, so the same entity looks the same in every panel */
	seriesColors: v.optional(v.record(v.string(), v.picklist(SERIES_COLOR_NAMES)), {})
});
export type DashboardModel = v.InferOutput<typeof DashboardModelSchema>;

/** Shape used for import/export — the same JSON you get from "Export". */
export const DashboardExportSchema = v.object({
	title: v.pipe(v.string(), v.trim(), v.nonEmpty('Title is required')),
	description: v.optional(v.string(), ''),
	tags: v.optional(v.array(v.string()), []),
	model: DashboardModelSchema
});
export type DashboardExport = v.InferOutput<typeof DashboardExportSchema>;

export type DashboardRecord = DashboardExport & {
	id: string;
	version: number;
	updatedAt: Date;
	starred: boolean;
	/** admins edit; viewers only see dashboards granted to them */
	canEdit: boolean;
};

export function newId() {
	return crypto.randomUUID().slice(0, 8);
}

/**
 * Parses a model read from the database. Panels whose type has since been removed become
 * a text panel saying so, instead of failing the whole dashboard, so they can be deleted.
 */
export function parseStoredModel(raw: unknown): DashboardModel {
	const known = new Set<string>(PANEL_TYPES);
	const model = raw as { panels?: unknown };
	if (!Array.isArray(model?.panels)) return v.parse(DashboardModelSchema, raw);
	const panels = model.panels.map((panel: { type?: unknown; title?: unknown }) =>
		known.has(String(panel?.type))
			? panel
			: {
					...panel,
					type: 'text',
					title: panel?.title || 'Unsupported panel',
					options: {
						content: `This panel's type \`${String(panel?.type)}\` no longer exists. Delete it or change its type.`
					}
				}
	);
	return v.parse(DashboardModelSchema, { ...model, panels });
}

/** Parses an object through the panel schema so every option has its default. */
export function normalizePanel(input: unknown): Panel {
	return v.parse(PanelSchema, input);
}
