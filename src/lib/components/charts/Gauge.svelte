<script lang="ts">
	import type { FieldConfig, PanelOptions } from '#lib/dashboard/types.ts';
	import { colorVar, formatValue, thresholdColor } from '#lib/format.ts';
	import { toSingleValue, type QueryResult } from '#lib/query/result.ts';

	let {
		result,
		field,
		options
	}: { result: QueryResult; field: FieldConfig; options: PanelOptions } = $props();

	const single = $derived(toSingleValue(result, options.reduce, options.valueColumn));
	const min = $derived(field.min ?? 0);
	const max = $derived(
		field.max ??
			(field.unit === 'percent'
				? 100
				: field.unit === 'percentunit'
					? 1
					: Math.max(100, single.value ?? 0))
	);
	const ratio = $derived(
		single.value === null ? 0 : Math.min(1, Math.max(0, (single.value - min) / (max - min || 1)))
	);
	const color = $derived(colorVar(thresholdColor(single.value, field.thresholds)));

	// 240° arc
	const START = 150;
	const SWEEP = 240;
	const R = 40;
	function point(angle: number) {
		const rad = (angle * Math.PI) / 180;
		return [50 + R * Math.cos(rad), 50 + R * Math.sin(rad)];
	}
	function arc(from: number, to: number) {
		const [x1, y1] = point(START + SWEEP * from);
		const [x2, y2] = point(START + SWEEP * to);
		const large = SWEEP * (to - from) > 180 ? 1 : 0;
		return `M${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2}`;
	}

	/** threshold bands drawn as a thin outer ring */
	const bands = $derived.by(() => {
		const steps = field.thresholds
			.map((t) => ({
				at: t.value === null ? 0 : (t.value - min) / (max - min || 1),
				color: t.color
			}))
			.sort((a, b) => a.at - b.at)
			.map((s) => ({ ...s, at: Math.min(1, Math.max(0, s.at)) }));
		return steps
			.map((s, i) => ({ from: s.at, to: steps[i + 1]?.at ?? 1, color: s.color }))
			.filter((b) => b.to > b.from);
	});
</script>

<div class="flex h-full items-center justify-center" style:container-type="size">
	<svg
		viewBox="0 0 100 88"
		class="h-full max-h-full w-full max-w-full"
		role="img"
		aria-label={formatValue(single.value, field.unit, field.decimals)}
	>
		{#each bands as band (band.from)}
			<path
				d={(() => {
					const r = 46;
					const p = (a: number) => [
						50 + r * Math.cos((a * Math.PI) / 180),
						50 + r * Math.sin((a * Math.PI) / 180)
					];
					const [x1, y1] = p(START + SWEEP * band.from);
					const [x2, y2] = p(START + SWEEP * band.to);
					return `M${x1},${y1} A${r},${r} 0 ${SWEEP * (band.to - band.from) > 180 ? 1 : 0} 1 ${x2},${y2}`;
				})()}
				fill="none"
				stroke={colorVar(band.color)}
				stroke-width="2"
				opacity="0.8"
			/>
		{/each}
		<path
			d={arc(0, 1)}
			fill="none"
			stroke="var(--surface-3)"
			stroke-width="8"
			stroke-linecap="round"
		/>
		{#if ratio > 0}
			<path d={arc(0, ratio)} fill="none" stroke={color} stroke-width="8" stroke-linecap="round" />
		{/if}
		<text
			x="50"
			y="55"
			text-anchor="middle"
			font-size="15"
			font-weight="600"
			fill="var(--fg)"
			class="tabular-nums"
		>
			{formatValue(single.value, field.unit, field.decimals)}
		</text>
		<text x="22" y="84" text-anchor="middle" font-size="6" fill="var(--muted)"
			>{formatValue(min, field.unit)}</text
		>
		<text x="78" y="84" text-anchor="middle" font-size="6" fill="var(--muted)"
			>{formatValue(max, field.unit)}</text
		>
	</svg>
</div>
