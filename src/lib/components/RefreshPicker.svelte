<script lang="ts">
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import Button from '#lib/components/ui/Button.svelte';
	import Menu from '#lib/components/ui/Menu.svelte';
	import { REFRESH_INTERVALS } from '#lib/dashboard/types.ts';

	let {
		interval,
		onrefresh,
		onchange,
		loading = false
	}: {
		interval: string;
		onrefresh: () => void;
		onchange: (interval: string) => void;
		loading?: boolean;
	} = $props();
</script>

<div class="flex items-center">
	<Button class="rounded-r-none" onclick={onrefresh} aria-label="Refresh">
		<RefreshCwIcon class={loading ? 'animate-spin' : ''} />
		<span class="max-sm:hidden">Refresh</span>
	</Button>
	<Menu
		items={REFRESH_INTERVALS.map((value) => ({
			label: value || 'Off',
			onclick: () => onchange(value)
		}))}
	>
		{#snippet trigger({ toggle })}
			<Button
				class="-ml-px rounded-l-none px-2"
				onclick={toggle}
				aria-label="Auto refresh interval"
			>
				{#if interval}<span class="text-xs text-accent">{interval}</span>{/if}
				<ChevronDownIcon />
			</Button>
		{/snippet}
	</Menu>
</div>
