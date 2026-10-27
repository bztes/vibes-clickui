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
		/** CSS variable per bar key; only used when the panel colors by a column */
		seriesColors?: Record<string, string>;
	} = $props();

	const items = $derived(toCategories(result, options));
	/** one color per bar when coloring by a column, otherwise all bars are blue */
	const colors = $derived(
		options.colorBy
			? assignSeriesColors(
					items.map((i) => i.key),
					seriesColors
				)
			: null
	);
	const max = $derived(field.max ?? Math.max(0, ...items.map((i) => i.value)));
	let hovered = $state<number | null>(null);
</script>

{#if options.orientation === 'vertical'}
	<div class="flex h-full items-end gap-1 px-1 pb-5">
		{#each items as item, i (i)}
			<div
				class="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
				role="img"
				aria-label="{item.label}: {formatValue(item.value, field.unit, field.decimals)}"
				onpointerenter={() => (hovered = i)}
				onpointerleave={() => (hovered = null)}
			>
				<span
					class={[
						'mb-1 text-[11px] text-fg-2 tabular-nums',
						hovered === i ? 'opacity-100' : 'opacity-0 group-first:opacity-100'
					]}
				>
					{formatValue(item.value, field.unit, field.decimals)}
				</span>
				<div
					class={['w-full max-w-12 rounded-t transition-opacity', !colors && 'bg-blue']}
					class:opacity-70={hovered !== null && hovered !== i}
					style:background={colors ? `var(${colors[i]})` : undefined}
					style:height="{max ? (item.value / max) * 100 : 0}%"
				></div>
				<span
					class="absolute -bottom-5 w-full truncate text-center text-[11px] text-muted"
					title={item.label}>{item.label}</span
				>
			</div>
		{/each}
	</div>
{:else}
	<div class="flex h-full flex-col gap-1.5 overflow-auto pr-1">
		{#each items as item, i (i)}
			<div
				class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-xs"
				title={item.label}
			>
				<div class="relative h-6 min-w-0 overflow-hidden rounded bg-surface-2">
					<div
						class={['absolute inset-y-0 left-0 rounded', !colors && 'bg-blue/80']}
						style:background={colors
							? `color-mix(in srgb, var(${colors[i]}) 80%, transparent)`
							: undefined}
						style:width="{max ? Math.max(0.5, (item.value / max) * 100) : 0}%"
					></div>
					<span class="absolute inset-0 flex items-center truncate px-2 text-fg">{item.label}</span>
				</div>
				<span class="text-right font-medium text-fg tabular-nums">
					{formatValue(item.value, field.unit, field.decimals)}
				</span>
			</div>
		{/each}
	</div>
{/if}
