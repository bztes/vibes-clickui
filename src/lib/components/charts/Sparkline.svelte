<script lang="ts">
	let { values, color }: { values: (number | null)[]; color: string } = $props();

	const path = $derived.by(() => {
		const v = values.map((x) => x ?? 0);
		const min = Math.min(...v);
		const max = Math.max(...v);
		const span = max - min || 1;
		const pts = v.map((y, i) => [
			(i / Math.max(1, v.length - 1)) * 100,
			30 - ((y - min) / span) * 26 - 2
		]);
		const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('');
		return { line, area: `${line}L100,30L0,30Z` };
	});
</script>

<svg viewBox="0 0 100 30" preserveAspectRatio="none" class="h-full w-full" aria-hidden="true">
	<path d={path.area} fill={color} fill-opacity="0.15" />
	<path
		d={path.line}
		fill="none"
		stroke={color}
		stroke-width="2"
		vector-effect="non-scaling-stroke"
	/>
</svg>
