<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import Button from '#lib/components/ui/Button.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import { COLOR_NAMES, type Threshold } from '#lib/dashboard/types.ts';
	import { colorVar } from '#lib/format.ts';

	let { thresholds = $bindable() }: { thresholds: Threshold[] } = $props();

	const sorted = $derived(
		thresholds
			.map((t, index) => ({ t, index }))
			.sort((a, b) => (b.t.value ?? -Infinity) - (a.t.value ?? -Infinity))
	);

	function add() {
		const max = Math.max(0, ...thresholds.map((t) => t.value ?? 0));
		thresholds = [...thresholds, { value: max + 10, color: 'warning' }];
	}
</script>

<div class="flex flex-col gap-1.5">
	{#each sorted as { t, index } (index)}
		<div class="flex items-center gap-1.5">
			<span class="size-3 shrink-0 rounded-full" style:background={colorVar(t.color)}></span>
			<Select size="sm" class="w-28" bind:value={thresholds[index].color}>
				{#each COLOR_NAMES as c (c)}<option value={c}>{c}</option>{/each}
			</Select>
			{#if t.value === null}
				<span class="flex-1 px-2 text-xs text-muted">Base</span>
			{:else}
				<Input size="sm" type="number" class="flex-1" bind:value={thresholds[index].value} />
				<Button
					size="icon-sm"
					variant="ghost"
					aria-label="Remove threshold"
					onclick={() => (thresholds = thresholds.filter((_, i) => i !== index))}
				>
					<XIcon />
				</Button>
			{/if}
		</div>
	{/each}
	<Button size="sm" variant="ghost" class="self-start" onclick={add}
		><PlusIcon /> Add threshold</Button
	>
</div>
