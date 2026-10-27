import { describe, expect, it } from 'vitest';
import { assignSeriesColors, SERIES_VARS } from './format.ts';

const colorOf = (keys: string[], key: string, pinned?: Record<string, string>) =>
	assignSeriesColors(keys, pinned)[keys.indexOf(key)];

describe('assignSeriesColors', () => {
	const services = ['frontend', 'cart', 'checkout', 'payment', 'inventory'];

	it('keeps a key’s color whatever the order', () => {
		const colors = Object.fromEntries(services.map((s) => [s, colorOf(services, s)]));
		const reversed = services.toReversed();
		for (const s of services) expect(colorOf(reversed, s)).toBe(colors[s]);
	});

	it('gives a lone key the same color in every chart', () => {
		const alone = colorOf(['checkout'], 'checkout');
		expect(colorOf(['frontend', 'checkout'], 'checkout')).toBe(alone);
		expect(colorOf(['checkout', 'payment'], 'checkout')).toBe(alone);
	});

	it('uses distinct colors while the palette lasts', () => {
		const keys = Array.from({ length: SERIES_VARS.length }, (_, i) => `series ${i}`);
		expect(new Set(assignSeriesColors(keys)).size).toBe(SERIES_VARS.length);
	});

	it('keeps pinned colors and avoids them for the other keys', () => {
		const pinned = Object.fromEntries(services.map((s, i) => [s, SERIES_VARS[i]]));
		const colors = assignSeriesColors([...services, 'search'], pinned);
		expect(colors.slice(0, services.length)).toEqual(SERIES_VARS.slice(0, services.length));
		expect(SERIES_VARS.slice(0, services.length)).not.toContain(colors.at(-1));
	});

	it('gives equal keys the same color', () => {
		const [a, b] = assignSeriesColors(['cart', 'cart']);
		expect(a).toBe(b);
	});
});
