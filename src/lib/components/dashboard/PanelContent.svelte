<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import TimeSeries from '#lib/components/charts/TimeSeries.svelte';
	import Stat from '#lib/components/charts/Stat.svelte';
	import Gauge from '#lib/components/charts/Gauge.svelte';
	import BarList from '#lib/components/charts/BarList.svelte';
	import Pie from '#lib/components/charts/Pie.svelte';
	import DataTable from '#lib/components/charts/DataTable.svelte';
	import LogsList from '#lib/components/charts/LogsList.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import { findDashboardState } from '#lib/dashboard/state.svelte.ts';
	import type { Panel } from '#lib/dashboard/types.ts';
	import { toCategories, toTimeSeries, type QueryResult } from '#lib/query/result.ts';
	import TextContent from './TextContent.svelte';

	let {
		panel,
		result,
		loading = false,
		onzoom
	}: {
		panel: Panel;
		result: QueryResult | undefined;
		loading?: boolean;
		onzoom?: (from: number, to: number) => void;
	} = $props();

	const dash = findDashboardState();
	const frame = $derived(
		panel.type === 'timeseries' && result ? toTimeSeries(result, panel.options) : null
	);

	// report the keys this panel colors by, so they can be pinned in the dashboard settings
	const colorKeys = $derived.by(() => {
		if (!result || result.error) return [];
		if (frame) return frame.series.map((s) => s.key);
		if (panel.type === 'pie' || (panel.type === 'bar' && panel.options.colorBy)) {
			return toCategories(result, panel.options).map((i) => i.key);
		}
		return [];
	});
	const owner = {};
	$effect(() => {
		if (!dash) return;
		dash.shownColorKeys.set(owner, colorKeys);
		return () => dash.shownColorKeys.delete(owner);
	});
</script>

{#if panel.type === 'text'}
	<TextContent content={panel.options.content} />
{:else if !result}
	<div class="flex h-full items-center justify-center">
		{#if loading}<Spinner class="size-5" />{:else}<span class="text-xs text-muted">No query</span
			>{/if}
	</div>
{:else if result.error}
	<div
		class="flex h-full items-start gap-2 overflow-auto rounded-md bg-critical/8 p-3 text-xs text-critical"
	>
		<TriangleAlertIcon class="mt-0.5 size-4 shrink-0" />
		<pre class="font-mono break-words whitespace-pre-wrap">{result.error}</pre>
	</div>
{:else if result.rows.length === 0}
	<div class="flex h-full items-center justify-center text-xs text-muted">No data</div>
{:else if panel.type === 'timeseries'}
	{#if frame}
		<TimeSeries
			{frame}
			from={result.from}
			to={result.to}
			field={panel.field}
			options={panel.options}
			seriesColors={dash?.seriesColorVars}
			{onzoom}
		/>
	{:else}
		<div
			class="flex h-full flex-col items-center justify-center gap-1 text-center text-xs text-muted"
		>
			<span>Time series need a DateTime column and at least one numeric column.</span>
			<span
				>Use <code class="font-mono">$__timeInterval(Timestamp) AS time</code> to bucket by time.</span
			>
		</div>
	{/if}
{:else if panel.type === 'stat'}
	<Stat {result} field={panel.field} options={panel.options} />
{:else if panel.type === 'gauge'}
	<Gauge {result} field={panel.field} options={panel.options} />
{:else if panel.type === 'bar'}
	<BarList
		{result}
		field={panel.field}
		options={panel.options}
		seriesColors={dash?.seriesColorVars}
	/>
{:else if panel.type === 'pie'}
	<Pie {result} field={panel.field} options={panel.options} seriesColors={dash?.seriesColorVars} />
{:else if panel.type === 'table'}
	<DataTable {result} field={panel.field.unit === 'none' ? undefined : panel.field} />
{:else if panel.type === 'logs'}
	<LogsList {result} options={panel.options} />
{/if}
