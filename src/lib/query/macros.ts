export type VariableValues = Record<string, string | string[]>;

export interface MacroContext {
	from: number;
	to: number;
	intervalSeconds: number;
	vars: VariableValues;
}

/** Escapes a value for use inside a single quoted ClickHouse string literal. */
export function escapeString(value: string) {
	return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Returns a single quoted ClickHouse string literal. */
export function sqlString(value: string) {
	return `'${escapeString(value)}'`;
}

function formatVariable(value: string | string[], format?: string) {
	if (Array.isArray(value)) {
		if (format === 'raw') return value.join(',');
		if (value.length === 0) return "''";
		return value.map(sqlString).join(',');
	}
	if (format === 'singlequote') return sqlString(value);
	return escapeString(value);
}

/** Splits `a, b(c, d), e` at top level commas. */
export function splitArgs(input: string) {
	const out: string[] = [];
	let depth = 0;
	let quote: string | null = null;
	let current = '';
	for (let i = 0; i < input.length; i++) {
		const c = input[i];
		if (quote) {
			if (c === '\\') {
				current += c + (input[++i] ?? '');
				continue;
			}
			if (c === quote) quote = null;
		} else if (c === "'" || c === '"' || c === '`') quote = c;
		else if (c === '(') depth++;
		else if (c === ')') depth--;
		else if (c === ',' && depth === 0) {
			out.push(current.trim());
			current = '';
			continue;
		}
		current += c;
	}
	if (current.trim()) out.push(current.trim());
	return out;
}

/** Replaces every `$__name(args)` call with the result of `fn(args)`, respecting nested parens. */
function replaceFunctionMacro(sql: string, name: string, fn: (args: string[]) => string) {
	const token = `$__${name}(`;
	let out = '';
	let index = 0;
	while (true) {
		const start = sql.indexOf(token, index);
		if (start === -1) break;
		let depth = 1;
		let i = start + token.length;
		for (; i < sql.length && depth > 0; i++) {
			if (sql[i] === '(') depth++;
			else if (sql[i] === ')') depth--;
		}
		if (depth !== 0) break;
		out += sql.slice(index, start) + fn(splitArgs(sql.slice(start + token.length, i - 1)));
		index = i;
	}
	return out + sql.slice(index);
}

const fromTime = (ms: number) => `fromUnixTimestamp64Milli(${Math.round(ms)})`;

/**
 * Expands Grafana-style macros and dashboard variables:
 *
 * - `$__timeFilter(col)` → `col >= <from> AND col <= <to>`
 * - `$__timeInterval(col)` → `toStartOfInterval(col, INTERVAL <interval> SECOND)`
 * - `$__conditionalAll(condition, $var)` → `condition`, or `1=1` when `$var` is "All"
 * - `$__fromTime`, `$__toTime` → DateTime64 literals; `$__from`, `$__to` → epoch ms
 * - `$__interval_s`, `$__interval_ms` → bucket size
 * - `$var`, `${var}`, `${var:singlequote}`, `${var:raw}` → variable values. Multi-value
 *   variables expand to a quoted list (`'a','b'`) for use in `IN (...)`.
 */
export function interpolate(sql: string, ctx: MacroContext, allVars: Set<string> = new Set()) {
	let out = sql;

	out = replaceFunctionMacro(out, 'conditionalAll', (args) => {
		const variable = (args[1] ?? '').replace(/^\$\{?|\}$/g, '');
		return allVars.has(variable) ? '1=1' : (args[0] ?? '1=1');
	});
	out = replaceFunctionMacro(
		out,
		'timeFilter',
		([col]) => `${col} >= ${fromTime(ctx.from)} AND ${col} <= ${fromTime(ctx.to)}`
	);
	out = replaceFunctionMacro(
		out,
		'timeInterval',
		([col]) => `toStartOfInterval(${col}, INTERVAL ${ctx.intervalSeconds} SECOND)`
	);

	out = out
		.replaceAll('$__fromTime', fromTime(ctx.from))
		.replaceAll('$__toTime', fromTime(ctx.to))
		.replaceAll('$__interval_ms', String(ctx.intervalSeconds * 1000))
		.replaceAll('$__interval_s', String(ctx.intervalSeconds))
		.replace(/\$__from\b/g, String(Math.round(ctx.from)))
		.replace(/\$__to\b/g, String(Math.round(ctx.to)));

	return replaceVariables(out, ctx.vars);
}

/** Substitutes `$var` / `${var}` / `${var:format}` only, leaving `$__` macros untouched. */
export function replaceVariables(sql: string, vars: VariableValues) {
	return sql.replace(
		/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::([a-z]+))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
		(match, braced: string | undefined, format: string | undefined, bare: string | undefined) => {
			const name = braced ?? bare!;
			if (name.startsWith('__') || !(name in vars)) return match;
			return formatVariable(vars[name], format);
		}
	);
}
