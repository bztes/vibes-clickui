import { isHttpError } from '@sveltejs/kit';
import { customOptions, type DashboardModel } from '#lib/dashboard/types.ts';
import { interpolate, type VariableValues } from '#lib/query/macros.ts';
import type { QueryResult } from '#lib/query/result.ts';
import { calculateInterval, resolveRange } from '#lib/time.ts';
import { errorMessage, getConnection, runSql } from './clickhouse.ts';

/** a missing or broken data source becomes an inline error instead of a failed request */
export async function connect(id: string) {
	try {
		return { connection: await getConnection(id || undefined) };
	} catch (e) {
		if (isHttpError(e)) return { error: e.body.message };
		throw e;
	}
}

export interface ExecuteArgs {
	datasource: string;
	sql: string;
	from: string;
	to: string;
	vars: VariableValues;
	allVars: string[];
	maxDataPoints: number;
	maxRows: number;
}

/** Expands macros/variables and runs the SQL. SQL errors are returned in `error`. */
export async function executeQuery(args: ExecuteArgs): Promise<QueryResult> {
	const { from, to } = resolveRange(args.from, args.to);
	const intervalSeconds = calculateInterval(from, to, args.maxDataPoints);
	const sql = interpolate(
		args.sql,
		{ from, to, intervalSeconds, vars: args.vars },
		new Set(args.allVars)
	);
	const base = { sql, from, to, intervalSeconds };
	const empty = { ...base, columns: [], rows: [], elapsedMs: 0, truncated: false };
	if (!sql.trim()) return empty;
	const { connection, error } = await connect(args.datasource);
	if (!connection) return { ...empty, error };
	try {
		return { ...base, ...(await runSql(connection.client, sql, args.maxRows)) };
	} catch (e) {
		return { ...empty, error: errorMessage(e) };
	}
}

/** Values of a query variable: the distinct first column of its query. */
export async function variableOptions(
	datasource: string,
	sql: string,
	fromExpr: string,
	toExpr: string,
	vars: VariableValues
): Promise<{ options: string[]; error?: string }> {
	const { from, to } = resolveRange(fromExpr, toExpr);
	const expanded = interpolate(sql, {
		from,
		to,
		intervalSeconds: calculateInterval(from, to, 1000),
		vars
	});
	const { connection, error } = await connect(datasource);
	if (!connection) return { options: [], error };
	try {
		const result = await runSql(connection.client, expanded, 1000);
		return { options: [...new Set(result.rows.map((r) => String(r[0] ?? '')))] };
	} catch (e) {
		return { options: [], error: errorMessage(e) };
	}
}

// Viewers resolve variables on every panel request; a short cache keeps that cheap.
const optionsCache = new Map<
	string,
	{ at: number; value: Promise<{ options: string[]; error?: string }> }
>();
const CACHE_MS = 15_000;

function cachedOptions(
	datasource: string,
	sql: string,
	from: string,
	to: string,
	vars: VariableValues
) {
	const key = JSON.stringify([datasource, sql, from, to, vars]);
	const hit = optionsCache.get(key);
	if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
	const value = variableOptions(datasource, sql, from, to, vars);
	optionsCache.set(key, { at: Date.now(), value });
	// Map keeps insertion order, so the first entry is the oldest
	if (optionsCache.size > 500) optionsCache.delete(optionsCache.keys().next().value!);
	return value;
}

/**
 * Resolves variable values submitted by a viewer against the saved dashboard. Values of query and
 * custom variables must be one of their options, so viewers can't inject their own SQL through them.
 * Stops after `until` (exclusive) when given, returning the options of that variable.
 */
export async function resolveVariables(
	model: DashboardModel,
	submitted: VariableValues,
	submittedAll: string[],
	from: string,
	to: string,
	until?: string
) {
	const values: VariableValues = {};
	const allVars: string[] = [];
	for (const variable of model.variables) {
		let options: string[] = [];
		let error: string | undefined;
		if (variable.type === 'custom') {
			options = customOptions(variable);
		} else if (variable.type === 'query') {
			({ options, error } = await cachedOptions(variable.datasource, variable.query, from, to, {
				...values
			}));
		}
		if (variable.name === until) return { values, allVars, options, error };

		const input = submitted[variable.name];
		if (variable.type === 'textbox') {
			values[variable.name] = typeof input === 'string' ? input : variable.query;
			continue;
		}
		if (variable.includeAll && submittedAll.includes(variable.name)) {
			values[variable.name] = options;
			allVars.push(variable.name);
			continue;
		}
		const picked = (Array.isArray(input) ? input : input === undefined ? [] : [input]).filter((v) =>
			options.includes(v)
		);
		values[variable.name] = variable.multi ? picked : (picked[0] ?? options[0] ?? '');
	}
	return { values, allVars, options: [] as string[], error: undefined as string | undefined };
}
