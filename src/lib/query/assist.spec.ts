import { describe, expect, it } from 'vitest';
import {
	arrayElement,
	columnExpr,
	isNullable,
	literal,
	mapTypes,
	quoteIdent,
	unwrapType
} from './assist.ts';

describe('types', () => {
	it('unwraps wrappers and splits map types', () => {
		expect(unwrapType('LowCardinality(Nullable(String))')).toBe('String');
		expect(mapTypes('Map(LowCardinality(String), String)')).toEqual({
			key: 'LowCardinality(String)',
			value: 'String'
		});
		expect(mapTypes('Map(String, Map(String, UInt8))')?.value).toBe('Map(String, UInt8)');
		expect(mapTypes('String')).toBeNull();
		expect(arrayElement('Array(LowCardinality(String))')).toBe('LowCardinality(String)');
		expect(isNullable('Nullable(UInt8)')).toBe(true);
		expect(isNullable('LowCardinality(Nullable(String))')).toBe(true);
		expect(isNullable('String')).toBe(false);
	});
});

describe('literals', () => {
	it('quotes by type', () => {
		expect(literal('42', 'UInt64')).toBe('42');
		expect(literal('4x', 'UInt64')).toBe("'4x'");
		expect(literal("o'neil", 'LowCardinality(String)')).toBe("'o\\'neil'");
		expect(literal('2026-01-01 00:00:00', 'DateTime64(9)')).toBe("'2026-01-01 00:00:00'");
		expect(literal('TRUE', 'Bool')).toBe('true');
	});

	it('quotes identifiers and map access', () => {
		expect(quoteIdent('ServiceName')).toBe('ServiceName');
		expect(quoteIdent('Events.Name')).toBe('`Events.Name`');
		expect(columnExpr('ResourceAttributes', { key: 'service.name', keyType: 'String' })).toBe(
			"ResourceAttributes['service.name']"
		);
	});
});
