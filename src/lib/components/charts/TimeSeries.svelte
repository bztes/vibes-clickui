<script lang="ts">
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';
	import { SvelteSet } from 'svelte/reactivity';
	import type { FieldConfig, PanelOptions } from '#lib/dashboard/types.ts';
	import { assignSeriesColors, formatValue, SERIES_VARS } from '#lib/format.ts';
	import type { TimeSeriesFrame } from '#lib/query/result.ts';
	import { formatDateTime } from '#lib/time.ts';
	import { theme } from '#lib/theme.svelte.ts';

	let {
		frame,
		from,
		to,
		field,
		options,
		seriesColors,
		spanGaps = false,
		onzoom
	}: {
		frame: TimeSeriesFrame;
		from: number;
		to: number;
		field: Pick<FieldConfig, 'unit' | 'decimals' | 'min' | 'max'>;
		options: Pick<PanelOptions, 'drawStyle' | 'lineWidth' | 'fillOpacity' | 'stacking' | 'legend'>;
		/** CSS variable per series key (e.g. `{ error: '--critical' }`); other series take the remaining palette colors */
		seriesColors?: Record<string, string>;
		/** connect lines across missing points, e.g. for raw series with unaligned timestamps */
		spanGaps?: boolean;
		onzoom?: (from: number, to: number) => void;
	} = $props();

	const colorVars = $derived(
		assignSeriesColors(
			frame.series.map((s) => s.key),
			seriesColors
		)
	);

	const hidden = new SvelteSet<string>();
	let hover = $state<{ idx: number; left: number; top: number; width: number } | null>(null);

	const fmt = (v: number | null) => formatValue(v, field.unit, field.decimals);

	function seriesColor(styles: CSSStyleDeclaration, i: number) {
		return styles.getPropertyValue(colorVars[i]).trim();
	}

	function alpha(color: string, opacity: number) {
		return `color-mix(in srgb, ${color} ${Math.round(opacity)}%, transparent)`;
	}

	function chart(node: HTMLDivElement) {
		const { x, series } = frame;
		const { drawStyle, lineWidth, fillOpacity, stacking } = options;
		const { min, max } = field;
		void theme.current;
		const visible = series.map((s) => !hidden.has(s.name));

		const styles = getComputedStyle(document.documentElement);
		const axisColor = styles.getPropertyValue('--muted').trim();
		const gridColor = styles.getPropertyValue('--grid').trim();

		// stacking: cumulative sums of the visible series, filled between neighbours
		let data: uPlot.AlignedData;
		const bands: uPlot.Band[] = [];
		if (stacking) {
			const acc = new Array(x.length).fill(0);
			let previous = -1;
			const stacked = series.map((s, i) => {
				if (!visible[i]) return s.values;
				const values = s.values.map((v, j) => (acc[j] += v ?? 0));
				if (previous !== -1) bands.push({ series: [i + 1, previous + 1] });
				previous = i;
				return values;
			});
			data = [x, ...stacked];
		} else {
			data = [x, ...series.map((s) => s.values)];
		}

		const bars = drawStyle === 'bars' ? uPlot.paths.bars!({ size: [0.75, 48], gap: 1 }) : undefined;
		const includeZero = stacking || drawStyle === 'bars';

		const opts = (width: number, height: number): uPlot.Options => ({
			width,
			height,
			legend: { show: false },
			padding: [8, 8, 0, 0],
			cursor: {
				drag: { x: !!onzoom, y: false, setScale: false },
				points: { size: 8, width: 2 },
				focus: { prox: 30 }
			},
			focus: { alpha: 0.35 },
			bands,
			scales: {
				x: { time: true, range: () => [from / 1000, to / 1000] },
				y: {
					range: (_u, dmin, dmax): uPlot.Range.MinMax => {
						if (dmin === null || dmax === null || !Number.isFinite(dmin))
							return [min ?? 0, max ?? 1];
						const [lo, hi] = uPlot.rangeNum(
							includeZero ? Math.min(0, dmin) : dmin,
							dmax,
							0.1,
							true
						) as [number, number];
						return [min ?? (includeZero ? Math.min(0, lo) : lo), max ?? hi];
					}
				}
			},
			axes: [
				{
					stroke: axisColor,
					grid: { stroke: gridColor, width: 1 },
					ticks: { show: false },
					font: '11px var(--font-sans), system-ui',
					space: 70
				},
				{
					stroke: axisColor,
					grid: { stroke: gridColor, width: 1 },
					ticks: { show: false },
					font: '11px var(--font-sans), system-ui',
					values: (_u, ticks) => ticks.map((t) => fmt(t)),
					size: (u, values) => {
						const longest = Math.max(0, ...(values ?? []).map((v) => String(v).length));
						return Math.max(32, longest * 6.5 + 14);
					},
					space: 30
				}
			],
			series: [
				{},
				...series.map((s, i): uPlot.Series => {
					const color = seriesColor(styles, i);
					return {
						label: s.name,
						show: visible[i],
						stroke: color,
						width: drawStyle === 'points' ? 0 : drawStyle === 'bars' ? 0 : lineWidth,
						fill:
							fillOpacity > 0 || drawStyle === 'bars'
								? alpha(color, drawStyle === 'bars' ? Math.max(fillOpacity, 60) : fillOpacity)
								: undefined,
						dash: i >= SERIES_VARS.length ? [5, 3] : undefined,
						paths: drawStyle === 'points' ? () => null : bars,
						points:
							drawStyle === 'points'
								? { show: true, size: 8, fill: color, stroke: color }
								: { show: false },
						spanGaps
					};
				})
			],
			hooks: {
				setCursor: [
					(u) => {
						const { idx, left, top } = u.cursor;
						hover =
							idx === null || idx === undefined || left === undefined || left < 0
								? null
								: { idx, left: left!, top: top!, width: u.over.clientWidth };
					}
				],
				setSelect: [
					(u) => {
						if (!onzoom || u.select.width < 5) return;
						const a = u.posToVal(u.select.left, 'x');
						const b = u.posToVal(u.select.left + u.select.width, 'x');
						u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
						onzoom(Math.round(a * 1000), Math.round(b * 1000));
					}
				]
			}
		});

		let u: uPlot | undefined;
		const ro = new ResizeObserver(([entry]) => {
			const { width, height } = entry.contentRect;
			if (width < 10 || height < 10) return;
			if (!u) u = new uPlot(opts(width, height), data, node);
			else u.setSize({ width, height });
		});
		ro.observe(node);

		return () => {
			ro.disconnect();
			u?.destroy();
			hover = null;
		};
	}

	const tooltipRows = $derived.by(() => {
		if (!hover) return [];
		const idx = hover.idx;
		return frame.series
			.map((s, i) => ({ name: s.name, value: s.values[idx], i }))
			.filter((r) => !hidden.has(r.name) && r.value !== null)
			.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
			.slice(0, 12);
	});

	const legendItems = $derived(
		frame.series
			.map((s, i) => ({ name: s.name, i }))
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
	);

	function toggle(name: string, solo: boolean) {
		if (solo) {
			const onlyThis = frame.series.every((s) => s.name === name || hidden.has(s.name));
			hidden.clear();
			if (!onlyThis) for (const s of frame.series) if (s.name !== name) hidden.add(s.name);
			return;
		}
		if (hidden.has(name)) hidden.delete(name);
		else hidden.add(name);
	}
</script>

<div class="flex h-full min-h-0 flex-col">
	<div class="relative min-h-0 flex-1">
		<div class="absolute inset-0" {@attach chart}></div>
		{#if hover && tooltipRows.length}
			<div
				class="pointer-events-none absolute z-20 min-w-40 rounded-md border border-line bg-surface/95 px-2.5 py-2 text-xs shadow-lg backdrop-blur"
				style:left="{hover.left > hover.width / 2 ? hover.left - 12 : hover.left + 60}px"
				style:top="{Math.max(0, hover.top - 20)}px"
				style:transform={hover.left > hover.width / 2 ? 'translateX(-100%)' : 'none'}
			>
				<div class="mb-1.5 text-muted">{formatDateTime(frame.x[hover.idx] * 1000)}</div>
				{#each tooltipRows as row (row.name)}
					<div class="flex items-center gap-2 py-0.5">
						<span class="h-0.5 w-3 rounded-full" style:background="var({colorVars[row.i]})"></span>
						<span class="max-w-56 flex-1 truncate text-fg-2">{row.name}</span>
						<span class="font-medium text-fg tabular-nums">{fmt(row.value)}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>
	{#if options.legend === 'list' && frame.series.length > 1}
		<div class="flex max-h-16 shrink-0 flex-wrap gap-x-3 gap-y-0.5 overflow-auto px-1 pt-1.5">
			{#each legendItems as s (s.name)}
				<button
					type="button"
					class={[
						'flex cursor-pointer items-center gap-1.5 text-xs',
						hidden.has(s.name) ? 'text-muted line-through opacity-60' : 'text-fg-2 hover:text-fg'
					]}
					title="Click to toggle, ⌘/Ctrl-click to show only this series"
					onclick={(e) => toggle(s.name, e.metaKey || e.ctrlKey)}
				>
					<span class="h-1 w-3.5 rounded-full" style:background="var({colorVars[s.i]})"></span>
					{s.name}
				</button>
			{/each}
		</div>
	{/if}
</div>
