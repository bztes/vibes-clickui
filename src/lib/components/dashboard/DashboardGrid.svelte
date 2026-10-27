<script lang="ts">
	import { getDashboardState } from '#lib/dashboard/state.svelte.ts';
	import {
		GRID_COLUMNS,
		GRID_GAP,
		ROW_HEIGHT,
		gridHeight,
		placeItem
	} from '#lib/dashboard/layout.ts';
	import type { GridPos } from '#lib/dashboard/types.ts';
	import PanelView from './PanelView.svelte';

	const dash = getDashboardState();

	let width = $state(0);
	const mobile = $derived(width > 0 && width < 720);
	const colWidth = $derived((width - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS);

	interface Drag {
		id: string;
		mode: 'move' | 'resize';
		startX: number;
		startY: number;
		dx: number;
		dy: number;
		origin: GridPos;
		/** layout when the drag started, so panels spring back when you move away */
		snapshot: { id: string; gridPos: GridPos }[];
	}
	let drag = $state<Drag | null>(null);

	const px = (pos: GridPos) => ({
		left: pos.x * (colWidth + GRID_GAP),
		top: pos.y * (ROW_HEIGHT + GRID_GAP),
		width: pos.w * colWidth + (pos.w - 1) * GRID_GAP,
		height: pos.h * ROW_HEIGHT + (pos.h - 1) * GRID_GAP
	});

	function start(e: PointerEvent, id: string, mode: Drag['mode']) {
		const panel = dash.panel(id);
		if (!panel || e.button !== 0) return;
		e.preventDefault();
		dash.dragging = true;
		drag = {
			id,
			mode,
			startX: e.clientX,
			startY: e.clientY,
			dx: 0,
			dy: 0,
			origin: { ...panel.gridPos },
			snapshot: dash.model.panels.map((p) => ({ id: p.id, gridPos: { ...p.gridPos } }))
		};
	}

	function move(e: PointerEvent) {
		if (!drag) return;
		drag.dx = e.clientX - drag.startX;
		drag.dy = e.clientY - drag.startY;
		const cols = Math.round(drag.dx / (colWidth + GRID_GAP));
		const rows = Math.round(drag.dy / (ROW_HEIGHT + GRID_GAP));
		const o = drag.origin;
		const target =
			drag.mode === 'move'
				? { ...o, x: o.x + cols, y: o.y + rows }
				: { ...o, w: o.w + cols, h: o.h + rows };
		const positions = placeItem(drag.snapshot, drag.id, target);
		for (const panel of dash.model.panels) {
			const next = positions.get(panel.id);
			const cur = panel.gridPos;
			if (next && (next.x !== cur.x || next.y !== cur.y || next.w !== cur.w || next.h !== cur.h)) {
				panel.gridPos = next;
			}
		}
	}

	function end() {
		drag = null;
		dash.dragging = false;
	}

	const sorted = $derived(
		[...dash.model.panels].sort((a, b) => a.gridPos.y - b.gridPos.y || a.gridPos.x - b.gridPos.x)
	);
	const height = $derived(Math.max(1, gridHeight(dash.model.panels)) * (ROW_HEIGHT + GRID_GAP));
</script>

<svelte:window onpointermove={move} onpointerup={end} onpointercancel={end} />

<div bind:clientWidth={width} class={['relative', drag && 'select-none']}>
	{#if mobile}
		<div class="flex flex-col gap-2">
			{#each sorted as panel (panel.id)}
				<div style:height="{Math.max(panel.gridPos.h, 6) * ROW_HEIGHT}px">
					<PanelView {panel} />
				</div>
			{/each}
		</div>
	{:else if width > 0}
		<div class="relative" style:height="{height + (dash.editing ? 120 : 0)}px">
			{#if drag}
				{@const placeholder = dash.panel(drag.id)?.gridPos}
				{#if placeholder}
					{@const p = px(placeholder)}
					<div
						class="absolute rounded-lg border-2 border-dashed border-accent/60 bg-accent/8 transition-all duration-100"
						style:left="{p.left}px"
						style:top="{p.top}px"
						style:width="{p.width}px"
						style:height="{p.height}px"
					></div>
				{/if}
			{/if}
			{#each dash.model.panels as panel (panel.id)}
				{@const dragging = drag?.id === panel.id}
				{@const p = dragging && drag ? px(drag.origin) : px(panel.gridPos)}
				<div
					class={[
						'absolute',
						dragging
							? 'z-30 opacity-90 shadow-2xl'
							: 'transition-[left,top,width,height] duration-150'
					]}
					style:left="{p.left + (dragging && drag?.mode === 'move' ? drag.dx : 0)}px"
					style:top="{p.top + (dragging && drag?.mode === 'move' ? drag.dy : 0)}px"
					style:width="{Math.max(
						colWidth,
						p.width + (dragging && drag?.mode === 'resize' ? drag.dx : 0)
					)}px"
					style:height="{Math.max(
						ROW_HEIGHT,
						p.height + (dragging && drag?.mode === 'resize' ? drag.dy : 0)
					)}px"
				>
					<PanelView {panel} onDragStart={(e) => start(e, panel.id, 'move')} />
					{#if dash.editing}
						<button
							type="button"
							aria-label="Resize panel"
							class="absolute right-0 bottom-0 size-4 cursor-se-resize touch-none"
							onpointerdown={(e) => start(e, panel.id, 'resize')}
						>
							<svg viewBox="0 0 10 10" class="absolute right-1 bottom-1 size-2.5 text-muted">
								<path
									d="M9 1L1 9M9 5L5 9"
									stroke="currentColor"
									stroke-width="1.2"
									stroke-linecap="round"
								/>
							</svg>
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
