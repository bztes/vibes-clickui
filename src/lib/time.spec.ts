import { describe, expect, it } from 'vitest';
import { calculateInterval, parseDuration, parseTime, resolveRange } from './time.ts';

const now = new Date(2026, 0, 15, 12, 30, 0).getTime();

describe('parseTime', () => {
	it('parses relative expressions', () => {
		expect(parseTime('now', now)).toBe(now);
		expect(parseTime('now-1h', now)).toBe(now - 3_600_000);
		expect(parseTime('now - 15m', now)).toBe(now - 900_000);
	});

	it('rounds to units', () => {
		expect(parseTime('now/d', now)).toBe(new Date(2026, 0, 15).getTime());
		expect(parseTime('now/d', now, true)).toBe(new Date(2026, 0, 16).getTime() - 1);
		expect(parseTime('now-1d/d', now)).toBe(new Date(2026, 0, 14).getTime());
	});

	it('parses absolute values', () => {
		expect(parseTime('1767225600000')).toBe(1767225600000);
		expect(parseTime('2026-01-01T00:00:00Z')).toBe(Date.UTC(2026, 0, 1));
		expect(parseTime('garbage')).toBeNull();
	});
});

it('resolveRange orders and falls back', () => {
	expect(resolveRange('now', 'now-1h', now)).toEqual({ from: now - 3_600_000, to: now });
	expect(resolveRange('nope', 'now', now)).toEqual({ from: now - 3_600_000, to: now });
});

it('calculateInterval picks nice buckets', () => {
	expect(calculateInterval(0, 3_600_000, 1000)).toBe(5);
	expect(calculateInterval(0, 86_400_000, 100)).toBe(900);
	expect(calculateInterval(0, 1000, 1000)).toBe(1);
});

it('parseDuration', () => {
	expect(parseDuration('30s')).toBe(30_000);
	expect(parseDuration('5m')).toBe(300_000);
	expect(parseDuration('')).toBe(0);
});
