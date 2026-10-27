import { describe, expect, it } from 'vitest';
import {
	columnKind,
	reduceValues,
	toCategories,
	toSingleValue,
	toTimeSeries,
	type Column
} from './result.ts';

const col = (name: string, type: string): Column => ({ name, type, kind: columnKind(type) });

describe('columnKind', () => {
	it('classifies ClickHouse types', () => {
		expect(columnKind('DateTime64(9)')).toBe('time');
		expect(columnKind('Nullable(Float64)')).toBe('number');
		expect(columnKind('LowCardinality(String)')).toBe('string');
		expect(columnKind('Map(LowCardinality(String), String)')).toBe('other');
	});
});

describe('toTimeSeries', () => {
	it('pivots label columns into series and aligns timestamps', () => {
		const frame = toTimeSeries({
			columns: [col('time', 'DateTime'), col('svc', 'String'), col('n', 'UInt64')],
			rows: [
				[2000, 'a', 1],
				[1000, 'a', 2],
				[1000, 'b', 3]
			]
		});
		expect(frame!.x).toEqual([1, 2]);
		expect(frame!.series).toEqual([
			{ name: 'a', key: 'a', values: [2, 1] },
			{ name: 'b', key: 'b', values: [3, null] }
		]);
	});

	it('keys series by the colorBy column', () => {
		const frame = toTimeSeries(
			{
				columns: [
					col('time', 'DateTime'),
					col('svc', 'String'),
					col('status', 'String'),
					col('n', 'UInt64')
				],
				rows: [
					[1000, 'a', 'ok', 1],
					[1000, 'a', 'error', 2]
				]
			},
			{ colorBy: 'svc' }
		);
		expect(frame!.series.map((s) => [s.name, s.key])).toEqual([
			['a, ok', 'a'],
			['a, error', 'a']
		]);
	});

	it('names series by the picked label column only', () => {
		const frame = toTimeSeries(
			{
				columns: [
					col('time', 'DateTime'),
					col('svc', 'String'),
					col('status', 'String'),
					col('n', 'UInt64')
				],
				rows: [
					[1000, 'a', 'ok', 1],
					[1000, 'b', 'error', 2]
				]
			},
			{ labelColumn: 'status', colorBy: 'svc' }
		);
		expect(frame!.series.map((s) => [s.name, s.key])).toEqual([
			['ok', 'a'],
			['error', 'b']
		]);
	});

	it('uses column names when there are no labels', () => {
		const frame = toTimeSeries({
			columns: [col('time', 'DateTime'), col('p50', 'Float64'), col('p99', 'Float64')],
			rows: [[1000, 1, 2]]
		});
		expect(frame!.series.map((s) => s.name)).toEqual(['p50', 'p99']);
	});

	it('returns null without a time column', () => {
		expect(toTimeSeries({ columns: [col('n', 'UInt8')], rows: [[1]] })).toBeNull();
	});
});

it('reduces values', () => {
	expect(reduceValues([1, null, 3], 'mean')).toBe(2);
	expect(reduceValues([1, null, 3], 'last')).toBe(3);
	expect(reduceValues([1, null, 3], 'count')).toBe(2);
	expect(reduceValues([], 'sum')).toBeNull();
});

it('extracts single values and categories', () => {
	const result = {
		columns: [col('time', 'DateTime'), col('v', 'Float64')],
		rows: [
			[1, 5],
			[2, 7]
		]
	};
	expect(toSingleValue(result, 'last', '')).toMatchObject({ value: 7, spark: [5, 7], name: 'v' });
	expect(
		toCategories({ columns: [col('svc', 'String'), col('n', 'UInt64')], rows: [['a', 3]] })
	).toEqual([{ label: 'a', key: 'a', value: 3 }]);
});

it('labels categories by the picked column', () => {
	const result = {
		columns: [col('svc', 'String'), col('region', 'String'), col('n', 'UInt64')],
		rows: [['a', 'eu', 3]]
	};
	expect(toCategories(result, { labelColumn: 'region', colorBy: 'svc' })).toEqual([
		{ label: 'eu', key: 'a', value: 3 }
	]);
});
