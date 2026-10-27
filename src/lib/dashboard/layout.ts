import type { GridPos } from './types.ts';

export const GRID_COLUMNS = 24;
export const ROW_HEIGHT = 30;
export const GRID_GAP = 8;

interface Item {
	id: string;
	gridPos: GridPos;
}

export function collides(a: GridPos, b: GridPos) {
	return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Moves every item as far up as it can go, preserving order. Returns new positions. */
export function compact(items: Item[]): Map<string, GridPos> {
	const sorted = [...items].sort((a, b) => a.gridPos.y - b.gridPos.y || a.gridPos.x - b.gridPos.x);
	const placed: GridPos[] = [];
	const out = new Map<string, GridPos>();
	for (const item of sorted) {
		const pos = { ...item.gridPos };
		pos.y = 0;
		while (placed.some((p) => collides(p, pos))) pos.y++;
		placed.push(pos);
		out.set(item.id, pos);
	}
	return out;
}

/**
 * Places `id` at `target`, pushes overlapping items down and compacts the result,
 * like Grafana's grid. The moved item gets priority over the ones it lands on.
 */
export function placeItem(items: Item[], id: string, target: GridPos): Map<string, GridPos> {
	const pos = clampPos(target);
	const positions = new Map(items.map((i) => [i.id, { ...i.gridPos }]));
	positions.set(id, pos);

	const queue = [id];
	while (queue.length) {
		const moverId = queue.shift()!;
		const mover = positions.get(moverId)!;
		for (const [otherId, other] of positions) {
			if (otherId === moverId || otherId === id) continue;
			if (collides(mover, other)) {
				other.y = mover.y + mover.h;
				queue.push(otherId);
			}
		}
	}

	// compact everything, but keep the dragged item first in its row so it wins ties
	const list = [...positions].map(([itemId, gridPos]) => ({
		id: itemId,
		gridPos: itemId === id ? { ...gridPos, y: gridPos.y - 0.5 } : gridPos
	}));
	const compacted = compact(list);
	return new Map([...compacted].map(([k, p]) => [k, { ...p, y: Math.round(p.y) }]));
}

export function clampPos(pos: GridPos): GridPos {
	const w = Math.max(1, Math.min(GRID_COLUMNS, Math.round(pos.w)));
	const h = Math.max(2, Math.round(pos.h));
	const x = Math.max(0, Math.min(GRID_COLUMNS - w, Math.round(pos.x)));
	const y = Math.max(0, Math.round(pos.y));
	return { x, y, w, h };
}

/** Finds a free spot for a new panel of size w×h (top-left first). */
export function findFreeSpot(items: Item[], w: number, h: number): GridPos {
	for (let y = 0; ; y++) {
		for (let x = 0; x <= GRID_COLUMNS - w; x++) {
			const pos = { x, y, w, h };
			if (!items.some((i) => collides(i.gridPos, pos))) return pos;
		}
	}
}

export function gridHeight(items: Item[]) {
	return items.reduce((max, i) => Math.max(max, i.gridPos.y + i.gridPos.h), 0);
}
