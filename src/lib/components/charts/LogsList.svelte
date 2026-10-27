<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { badge } from '#lib/components/ui/variants.ts';
	import type { PanelOptions } from '#lib/dashboard/types.ts';
	import { colorVar, severityColor } from '#lib/format.ts';
	import type { QueryResult } from '#lib/query/result.ts';
	import { toObjects } from '#lib/query/result.ts';
	import { formatDateTime } from '#lib/time.ts';

	let {
		result,
		options,
		wrap = false
	}: {
		result: Pick<QueryResult, 'columns' | 'rows'>;
		options: Pick<PanelOptions, 'levelColumn' | 'labelColumn' | 'messageColumn'>;
		wrap?: boolean;
	} = $props();

	const logs = $derived(toObjects(result));
	const timeCol = $derived(result.columns.find((c) => c.kind === 'time')?.name);
	const levelCol = $derived(options.levelColumn);
	const labelCol = $derived(options.labelColumn);
	const messageCol = $derived(
		options.messageColumn ||
			result.columns.find((c) => c.kind === 'string' && c.name !== levelCol && c.name !== labelCol)
				?.name
	);
	let expanded = $state<number | null>(null);

	const tone = (sev: string) => {
		const c = severityColor(sev);
		return c === 'muted' ? 'muted' : c;
	};
</script>

<div class="h-full overflow-auto font-mono text-xs">
	{#each logs as log, i (i)}
		{@const sev = levelCol ? String(log[levelCol] ?? '') : ''}
		<div class="border-b border-line/50">
			<button
				type="button"
				class="flex w-full cursor-pointer items-start gap-2 px-1.5 py-1 text-left hover:bg-surface-2"
				onclick={() => (expanded = expanded === i ? null : i)}
			>
				<ChevronRightIcon
					class={[
						'mt-0.5 size-3 shrink-0 text-muted transition-transform',
						expanded === i && 'rotate-90'
					]}
				/>
				<span
					class="mt-0.5 h-3.5 w-0.5 shrink-0 rounded-full"
					style:background={colorVar(severityColor(sev))}
				></span>
				{#if timeCol}
					<span class="shrink-0 whitespace-nowrap text-muted"
						>{formatDateTime(log[timeCol] as number, true)}</span
					>
				{/if}
				{#if sev}<span class={badge({ tone: tone(sev), class: 'shrink-0' })}>{sev}</span>{/if}
				{#if labelCol && log[labelCol]}<span class="shrink-0 text-violet">{log[labelCol]}</span
					>{/if}
				<span class={['min-w-0 text-fg', wrap ? 'break-all whitespace-pre-wrap' : 'truncate']}
					>{messageCol ? log[messageCol] : ''}</span
				>
			</button>
			{#if expanded === i}
				<div class="space-y-0.5 bg-surface-2/50 py-2 pr-2 pl-9">
					{#each Object.entries(log) as [key, value] (key)}
						{#if value !== '' && !(typeof value === 'object' && value && Object.keys(value).length === 0)}
							<div class="grid grid-cols-[12rem_1fr] gap-2">
								<span class="truncate text-muted">{key}</span>
								{#if typeof value === 'object' && value}
									<div>
										{#each Object.entries(value) as [k, v] (k)}
											<div>
												<span class="text-fg-2">{k}</span>=<span class="text-fg">{String(v)}</span>
											</div>
										{/each}
									</div>
								{:else}
									<span class="break-all whitespace-pre-wrap text-fg"
										>{key === timeCol ? formatDateTime(value as number, true) : String(value)}</span
									>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		</div>
	{:else}
		<p class="p-4 text-center text-muted">No log lines</p>
	{/each}
</div>
