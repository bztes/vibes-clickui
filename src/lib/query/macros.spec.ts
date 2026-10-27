import { describe, expect, it } from 'vitest';
import { interpolate, replaceVariables, sqlString } from './macros.ts';

const ctx = { from: 1_000, to: 61_000, intervalSeconds: 15, vars: {} };

describe('interpolate', () => {
	it('expands time macros', () => {
		expect(interpolate('WHERE $__timeFilter(Timestamp)', ctx)).toBe(
			'WHERE Timestamp >= fromUnixTimestamp64Milli(1000) AND Timestamp <= fromUnixTimestamp64Milli(61000)'
		);
		expect(interpolate('$__timeInterval(toDateTime(TimeUnix))', ctx)).toBe(
			'toStartOfInterval(toDateTime(TimeUnix), INTERVAL 15 SECOND)'
		);
		expect(interpolate('$__from $__to $__interval_s $__interval_ms', ctx)).toBe(
			'1000 61000 15 15000'
		);
	});

	it('quotes multi-value variables and escapes single values', () => {
		const vars = { service: ['a', "o'neil"], env: "pro'd" };
		expect(interpolate('IN (${service}) AND env = $env', { ...ctx, vars })).toBe(
			"IN ('a','o\\'neil') AND env = pro\\'d"
		);
		expect(interpolate('${env:singlequote}', { ...ctx, vars })).toBe("'pro\\'d'");
		expect(interpolate('IN (${service})', { ...ctx, vars: { service: [] } })).toBe("IN ('')");
	});

	it('handles $__conditionalAll', () => {
		const sql = 'WHERE $__conditionalAll(ServiceName IN (${service}), $service)';
		expect(interpolate(sql, { ...ctx, vars: { service: ['a'] } }, new Set(['service']))).toBe(
			'WHERE 1=1'
		);
		expect(interpolate(sql, { ...ctx, vars: { service: ['a'] } })).toBe(
			"WHERE ServiceName IN ('a')"
		);
	});

	it('leaves unknown variables alone', () => {
		expect(interpolate("Attributes['$x'] $__unknown", ctx)).toBe("Attributes['$x'] $__unknown");
	});
});

describe('replaceVariables', () => {
	it('substitutes variables but keeps macros', () => {
		expect(replaceVariables('$__timeFilter(T) AND s IN (${s})', { s: ['x'] })).toBe(
			"$__timeFilter(T) AND s IN ('x')"
		);
	});
});

it('sqlString escapes backslashes and quotes', () => {
	expect(sqlString("a\\b'c")).toBe("'a\\\\b\\'c'");
});
