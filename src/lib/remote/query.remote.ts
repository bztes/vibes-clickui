import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { query } from '$app/server';
import { eq } from 'drizzle-orm';
import { errorMessage, runSql } from '#lib/server/clickhouse.ts';
import { db } from '#lib/server/db/index.ts';
import { dashboard } from '#lib/server/db/schema.ts';
import { canViewDashboard, requireAdmin, requireUser } from '#lib/server/guard.ts';
import { connect, executeQuery, resolveVariables, variableOptions } from '#lib/server/query.ts';
import { parseStoredModel } from '#lib/dashboard/types.ts';
import { arrayElement, columnExpr, mapTypes, quoteIdent } from '#lib/query/assist.ts';
import { sqlString } from '#lib/query/macros.ts';

const VarsSchema = v.optional(v.record(v.string(), v.union([v.string(), v.array(v.string())])), {});

const TimeArgs = {
	/** time expressions (`now-1h`) are resolved on the server so refreshes move the window */
	from: v.optional(v.string(), 'now-1h'),
	to: v.optional(v.string(), 'now'),
	vars: VarsSchema,
	/** variables currently set to "All", for `$__conditionalAll` */
	allVars: v.optional(v.array(v.string()), []),
	maxDataPoints: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(10_000)), 1000)
};

/** Runs arbitrary read-only SQL. Admins only — viewers go through `runPanel`. */
export const runQuery = query(
	v.object({
		/** data source id; empty uses the default */
		datasource: v.optional(v.string(), ''),
		sql: v.pipe(v.string(), v.maxLength(100_000)),
		...TimeArgs,
		maxRows: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(100_000)), 10_000)
	}),
	async (args) => {
		requireAdmin();
		return executeQuery(args);
	}
);

/** Options of a query variable while editing. Admins only. */
export const getVariableOptions = query(
	v.object({
		datasource: v.optional(v.string(), ''),
		sql: v.string(),
		from: v.string(),
		to: v.string(),
		vars: VarsSchema
	}),
	async (args) => {
		requireAdmin();
		return variableOptions(args.datasource, args.sql, args.from, args.to, args.vars);
	}
);

async function loadModel(dashboardId: string) {
	const user = requireUser();
	if (!(await canViewDashboard(user, dashboardId))) error(404, 'Dashboard not found');
	const [d] = await db
		.select({ model: dashboard.model })
		.from(dashboard)
		.where(eq(dashboard.id, dashboardId));
	if (!d) error(404, 'Dashboard not found');
	return parseStoredModel(d.model);
}

/**
 * Runs a panel of a saved dashboard. The SQL comes from the
 * database, never from the client, and variable values are checked against their options.
 */
export const runPanel = query(
	v.object({ dashboardId: v.string(), panelId: v.string(), ...TimeArgs }),
	async (args) => {
		const model = await loadModel(args.dashboardId);
		const panel = model.panels.find((p) => p.id === args.panelId);
		if (!panel) error(404, 'Panel not found');
		const { values, allVars } = await resolveVariables(
			model,
			args.vars,
			args.allVars,
			args.from,
			args.to
		);
		return executeQuery({
			datasource: panel.datasource,
			sql: panel.sql,
			from: args.from,
			to: args.to,
			vars: values,
			allVars,
			maxDataPoints: args.maxDataPoints,
			maxRows: 10_000
		});
	}
);

/** Options of a variable of a saved dashboard, for viewers. */
export const getDashboardVariableOptions = query(
	v.object({
		dashboardId: v.string(),
		name: v.string(),
		from: v.string(),
		to: v.string(),
		vars: VarsSchema,
		allVars: v.optional(v.array(v.string()), [])
	}),
	async (args) => {
		const model = await loadModel(args.dashboardId);
		const { options, error } = await resolveVariables(
			model,
			args.vars,
			args.allVars,
			args.from,
			args.to,
			args.name
		);
		return { options, error };
	}
);

/** Tables and columns of the telemetry database, for the SQL editor sidebar. Admins only. */
export const getSchema = query(v.optional(v.string(), ''), async (datasource) => {
	requireAdmin();
	const { connection } = await connect(datasource);
	if (!connection) return [];
	const result = await runSql(
		connection.client,
		`SELECT table, name, type FROM system.columns
		 WHERE database = currentDatabase() AND table NOT LIKE '.inner%'
		 ORDER BY table, position`,
		20_000
	);
	const tables = new Map<string, { name: string; type: string }[]>();
	for (const [table, name, type] of result.rows as string[][]) {
		if (!tables.has(table)) tables.set(table, []);
		tables.get(table)!.push({ name, type });
	}
	return [...tables].map(([name, columns]) => ({ name, columns }));
});

/**
 * Most frequent values of a column (or of one map key, or the keys of a map column) for the
 * SQL editor's insert menu. Looks at a sample of the table only. Admins only.
 */
export const getColumnValues = query(
	v.object({
		datasource: v.optional(v.string(), ''),
		table: v.string(),
		column: v.string(),
		/** `keys` lists the keys of a map column */
		mode: v.optional(v.picklist(['values', 'keys']), 'values'),
		/** with `values` on a map column: the key whose values to list */
		key: v.optional(v.string()),
		search: v.optional(v.pipe(v.string(), v.maxLength(200)), '')
	}),
	async (args) => {
		requireAdmin();
		const { connection, error } = await connect(args.datasource);
		if (!connection) return { values: [], error };
		try {
			// identifiers only reach the SQL after they are found in the schema
			const found = await runSql(
				connection.client,
				`SELECT type FROM system.columns WHERE database = currentDatabase()
				 AND table = ${sqlString(args.table)} AND name = ${sqlString(args.column)}`,
				1
			);
			const type = found.rows[0]?.[0] as string | undefined;
			if (!type) return { values: [], error: 'Unknown column' };
			const column = quoteIdent(args.column);
			const map = mapTypes(type);
			let expr = column;
			if (map && args.mode === 'keys') expr = `arrayJoin(mapKeys(${column}))`;
			else if (map && args.key !== undefined)
				expr = columnExpr(args.column, { key: args.key, keyType: map.key });
			else if (arrayElement(type)) expr = `arrayJoin(${column})`;
			const filter = args.search
				? `WHERE positionCaseInsensitiveUTF8(toString(v), ${sqlString(args.search)}) > 0`
				: '';
			const result = await runSql(
				connection.client,
				`SELECT toString(v), count() AS c
				 FROM (SELECT ${expr} AS v FROM ${quoteIdent(args.table)} LIMIT 1000000)
				 ${filter}
				 GROUP BY v ORDER BY c DESC LIMIT 100
				 SETTINGS max_execution_time = 5, timeout_overflow_mode = 'break'`,
				100
			);
			return {
				values: result.rows.map(([value, count]) => ({
					value: String(value),
					count: Number(count)
				}))
			};
		} catch (e) {
			return { values: [], error: errorMessage(e) };
		}
	}
);
