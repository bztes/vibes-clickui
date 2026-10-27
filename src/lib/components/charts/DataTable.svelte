<script lang="ts">
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import type { FieldConfig } from '#lib/dashboard/types.ts';
	import { formatValue } from '#lib/format.ts';
	import type { Column, QueryResult } from '#lib/query/result.ts';
	import { formatDateTime } from '#lib/time.ts';

	let {
		result,
		field,
		maxRows = 1000,
		onCellClick
	}: {
		result: Pick<QueryResult, 'columns' | 'rows'>;
		field?: FieldConfig;
		maxRows?: number;
		onCellClick?: (column: Column, value: unknown, row: unknown[]) => void;
	} = $props();

	let sortBy = $state<number | null>(null);
	let desc = $state(true);

	const rows = $derived.by(() => {
		if (sortBy === null) return result.rows.slice(0, maxRows);
		const i = sortBy;
		const dir = desc ? -1 : 1;
		return [...result.rows]
			.sort((a, b) => {
				const x = a[i] as never;
				const y = b[i] as never;
				if (x === y) return 0;
				if (x === null) return 1;
				if (y === null) return -1;
				return (x > y ? 1 : -1) * dir;
			})
			.slice(0, maxRows);
	});

	function cell(column: Column, value: unknown) {
		if (value === null || value === undefined) return '–';
		if (column.kind === 'time') return formatDateTime(value as number, true);
		if (column.kind === 'number')
			return field ? formatValue(value, field.unit, field.decimals) : String(value);
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
	}

	function sort(i: number) {
		if (sortBy === i) {
			if (!desc) sortBy = null;
			desc = !desc;
			if (sortBy === null) desc = true;
		} else {
			sortBy = i;
			desc = true;
		}
	}
</script>

<div class="h-full overflow-auto">
	<table class="w-full border-separate border-spacing-0 text-xs">
		<thead class="sticky top-0 z-10 bg-surface">
			<tr>
				{#each result.columns as column, i (i)}
					<th
						class={[
							'border-b border-line px-2.5 py-1.5 font-medium whitespace-nowrap text-fg-2',
							column.kind === 'number' ? 'text-right' : 'text-left'
						]}
						title={column.type}
					>
						<button
							type="button"
							class="inline-flex cursor-pointer items-center gap-1 hover:text-fg"
							onclick={() => sort(i)}
						>
							{column.name}
							{#if sortBy === i}
								{#if desc}<ArrowDownIcon class="size-3" />{:else}<ArrowUpIcon class="size-3" />{/if}
							{/if}
						</button>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows as row, r (r)}
				<tr class="hover:bg-surface-2">
					{#each result.columns as column, i (i)}
						<td
							class={[
								'max-w-md truncate border-b border-line/60 px-2.5 py-1.5',
								column.kind === 'number' ? 'text-right tabular-nums' : '',
								column.kind === 'time' ? 'font-mono text-[11px] whitespace-nowrap text-fg-2' : '',
								onCellClick ? 'cursor-pointer' : ''
							]}
							title={typeof row[i] === 'object'
								? JSON.stringify(row[i], null, 2)
								: String(row[i] ?? '')}
							onclick={() => onCellClick?.(column, row[i], row)}
						>
							{cell(column, row[i])}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
	{#if result.rows.length > maxRows}
		<p class="p-2 text-center text-xs text-muted">Showing {maxRows} of {result.rows.length} rows</p>
	{/if}
</div>
