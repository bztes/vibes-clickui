import { describe, expect, it } from 'vitest';
import { collides, compact, findFreeSpot, placeItem } from './layout.ts';

const items = [
	{ id: 'a', gridPos: { x: 0, y: 0, w: 12, h: 4 } },
	{ id: 'b', gridPos: { x: 12, y: 0, w: 12, h: 4 } },
	{ id: 'c', gridPos: { x: 0, y: 4, w: 24, h: 4 } }
];

describe('layout', () => {
	it('detects collisions', () => {
		expect(collides(items[0].gridPos, items[1].gridPos)).toBe(false);
		expect(collides(items[0].gridPos, { x: 6, y: 2, w: 12, h: 4 })).toBe(true);
	});

	it('compacts items upwards', () => {
		const out = compact([{ id: 'x', gridPos: { x: 0, y: 10, w: 6, h: 2 } }]);
		expect(out.get('x')).toEqual({ x: 0, y: 0, w: 6, h: 2 });
	});

	it('pushes overlapped items down and never overlaps', () => {
		const out = placeItem(items, 'c', { x: 0, y: 0, w: 24, h: 4 });
		expect(out.get('c')).toEqual({ x: 0, y: 0, w: 24, h: 4 });
		expect(out.get('a')!.y).toBe(4);
		expect(out.get('b')!.y).toBe(4);
		const all = [...out.values()];
		for (let i = 0; i < all.length; i++)
			for (let j = i + 1; j < all.length; j++) expect(collides(all[i], all[j])).toBe(false);
	});

	it('clamps positions into the grid', () => {
		const out = placeItem(items, 'a', { x: 30, y: -3, w: 12, h: 4 });
		expect(out.get('a')!.x).toBe(12);
		expect(out.get('a')!.y).toBe(0);
	});

	it('finds a free spot', () => {
		expect(findFreeSpot(items, 12, 4)).toEqual({ x: 0, y: 8, w: 12, h: 4 });
		expect(findFreeSpot([items[0]], 12, 4)).toEqual({ x: 12, y: 0, w: 12, h: 4 });
	});
});
