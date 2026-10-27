<script lang="ts">
	import TableIcon from '@lucide/svelte/icons/table';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import Input from '#lib/components/ui/Input.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import { getSchema } from '#lib/remote/query.remote.ts';
	import { quoteIdent } from '#lib/query/assist.ts';

	let {
		datasource = '',
		oninsert,
		class: className = ''
	}: {
		datasource?: string;
		/** a table or column name was picked, already quoted */
		oninsert: (text: string) => void;
		class?: string;
	} = $props();

	let expanded = $state<string | null>(null);
	let filter = $state('');

	const schema = $derived(getSchema(datasource));
	const tables = $derived(
		(schema.current ?? []).filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()))
	);
</script>

<div class={['flex flex-col', className]}>
	<div class="border-b border-line p-2">
		<Input size="sm" placeholder="Filter tables" bind:value={filter} />
	</div>
	<div class="min-h-0 flex-1 overflow-auto p-1 text-xs">
		{#if schema.loading && !schema.current}<div class="p-3"><Spinner /></div>{/if}
		{#each tables as table (table.name)}
			<div>
				<div class="group flex items-center rounded hover:bg-surface-2">
					<button
						type="button"
						class="flex flex-1 cursor-pointer items-center gap-1 px-1.5 py-1 text-left"
						onclick={() => (expanded = expanded === table.name ? null : table.name)}
					>
						<ChevronRightIcon
							class={[
								'size-3 text-muted transition-transform',
								expanded === table.name && 'rotate-90'
							]}
						/>
						<TableIcon class="size-3.5 text-muted" />
						<span class="truncate font-mono text-fg">{table.name}</span>
					</button>
					<button
						type="button"
						class="mr-1 hidden cursor-pointer rounded px-1 text-[10px] text-accent group-hover:block"
						onclick={() => oninsert(quoteIdent(table.name))}>insert</button
					>
				</div>
				{#if expanded === table.name}
					<ul class="mb-1 ml-5 border-l border-line pl-2">
						{#each table.columns as column (column.name)}
							<li>
								<button
									type="button"
									class="flex w-full cursor-pointer items-baseline gap-2 rounded px-1 py-0.5 text-left hover:bg-surface-2"
									title="Insert {column.name}"
									onclick={() => oninsert(quoteIdent(column.name))}
								>
									<span class="truncate font-mono text-fg-2">{column.name}</span>
									<span class="ml-auto shrink-0 truncate text-[10px] text-muted"
										>{column.type.replace(/LowCardinality\((.*)\)/, '$1')}</span
									>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{:else}
			{#if !schema.loading}<p class="p-3 text-muted">
					No tables. Is a data source configured?
				</p>{/if}
		{/each}
	</div>
</div>
