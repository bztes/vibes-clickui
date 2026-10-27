<script lang="ts">
	import type { FieldConfig, PanelOptions } from '#lib/dashboard/types.ts';
	import { colorVar, formatValue, thresholdColor } from '#lib/format.ts';
	import type { QueryResult } from '#lib/query/result.ts';
	import { toSingleValue } from '#lib/query/result.ts';
	import Sparkline from './Sparkline.svelte';

	let {
		result,
		field,
		options
	}: {
		result: QueryResult;
		field: FieldConfig;
		options: PanelOptions;
	} = $props();

	const single = $derived(toSingleValue(result, options.reduce, options.valueColumn));
	const color = $derived(colorVar(thresholdColor(single.value, field.thresholds)));
	const text = $derived(formatValue(single.value, field.unit, field.decimals));
</script>

<div
	class="relative flex h-full flex-col justify-center overflow-hidden rounded-md"
	style:background={options.colorMode === 'background'
		? `color-mix(in srgb, ${color} 85%, transparent)`
		: undefined}
>
	<div
		class="relative z-10 flex flex-1 items-center justify-center px-2"
		style:container-type="size"
	>
		<span
			class="truncate leading-none font-semibold tabular-nums"
			style:font-size="clamp(16px, min(42cqh, 22cqw), 64px)"
			style:color={options.colorMode === 'value'
				? color
				: options.colorMode === 'background'
					? 'white'
					: 'var(--fg)'}
		>
			{text}
		</span>
	</div>
	{#if options.sparkline && single.spark.length > 1}
		<div class="absolute inset-x-0 bottom-0 h-2/5 opacity-80">
			<Sparkline
				values={single.spark}
				color={options.colorMode === 'background' ? 'white' : color}
			/>
		</div>
	{/if}
</div>
