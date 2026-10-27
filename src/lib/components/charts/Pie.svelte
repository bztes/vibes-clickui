<script lang="ts">
	import type { FieldConfig, PanelOptions } from '#lib/dashboard/types.ts';
	import { assignSeriesColors, formatValue } from '#lib/format.ts';
	import { toCategories, type QueryResult } from '#lib/query/result.ts';

	let {
		result,
		field,
		options,
		seriesColors
	}: {
		result: QueryResult;
		field: FieldConfig;
		options: PanelOptions;
		/** CSS variable per slice key; other slices take the remaining palette colors */
		seriesColors?: Record<string, string>;
	} = $props();

	const MAX_SLICES = 7;

	/** at most 7 slices + "Other" so colors never repeat */
	const slices = $derived.by(() => {
		const items = toCategories(result, options)
			.filter((i) => i.value > 0)
			.sort((a, b) => b.value - a.value);
		const top = items.slice(0, MAX_SLICES);
		const rest = items.slice(MAX_SLICES).reduce((s, i) => s + i.value, 0);
		if (rest > 0) top.push({ label: 'Other', key: 'Other', value: rest });
		const total = top.reduce((s, i) => s + i.value, 0);
		const colors = assignSeriesColors(
			top.map((i) => i.key),
			{ Other: '--muted', ...seriesColors }
		);
		let acc = 0;
		return top.map((item, i) => {
			const start = acc / total;
			acc += item.value;
			return {
				...item,
				start,
				end: acc / total,
				pct: item.value / total,
				color: `var(${colors[i]})`
			};
		});
	});

	let hovered = $state<number | null>(null);

	function slicePath(start: number, end: number) {
		const r = 45;
		const inner = 28;
		const gap = slices.length > 1 ? 0.004 : 0;
		const a0 = (start + gap) * 2 * Math.PI - Math.PI / 2;
		const a1 = (end - gap) * 2 * Math.PI - Math.PI / 2;
		const large = end - start > 0.5 ? 1 : 0;
		const p = (a: number, rad: number) => `${50 + rad * Math.cos(a)},${50 + rad * Math.sin(a)}`;
		if (end - start >= 0.9999) {
			return `M50,5 A45,45 0 1 1 49.99,5 Z M50,22 A28,28 0 1 0 50.01,22 Z`;
		}
		return `M${p(a0, r)} A${r},${r} 0 ${large} 1 ${p(a1, r)} L${p(a1, inner)} A${inner},${inner} 0 ${large} 0 ${p(a0, inner)} Z`;
	}
</script>

<div class="flex h-full items-center gap-4 overflow-hidden">
	<svg
		viewBox="0 0 100 100"
		class="h-full max-h-full min-w-0 flex-1"
		role="img"
		aria-label="Pie chart"
	>
		{#each slices as slice, i (slice.label)}
			<path
				d={slicePath(slice.start, slice.end)}
				fill={slice.color}
				fill-rule="evenodd"
				opacity={hovered === null || hovered === i ? 1 : 0.35}
				role="presentation"
				onpointerenter={() => (hovered = i)}
				onpointerleave={() => (hovered = null)}
			/>
		{/each}
		{#if hovered !== null && slices[hovered]}
			<text x="50" y="49" text-anchor="middle" font-size="9" font-weight="600" fill="var(--fg)">
				{(slices[hovered].pct * 100).toFixed(1)}%
			</text>
			<text x="50" y="59" text-anchor="middle" font-size="5.5" fill="var(--muted)">
				{formatValue(slices[hovered].value, field.unit, field.decimals)}
			</text>
		{/if}
	</svg>
	<ul class="flex max-h-full max-w-[50%] flex-col gap-1 overflow-auto text-xs">
		{#each slices as slice, i (slice.label)}
			<li
				class="flex items-center gap-2"
				onpointerenter={() => (hovered = i)}
				onpointerleave={() => (hovered = null)}
			>
				<span class="size-2.5 shrink-0 rounded-sm" style:background={slice.color}></span>
				<span class="truncate text-fg-2" title={slice.label}>{slice.label}</span>
				<span class="ml-auto pl-2 text-fg tabular-nums">{(slice.pct * 100).toFixed(1)}%</span>
			</li>
		{/each}
	</ul>
</div>
