<script lang="ts" module>
	export interface MenuItem {
		label: string;
		icon?: import('svelte').Component<{ class?: string }>;
		onclick?: () => void;
		href?: string;
		danger?: boolean;
		shortcut?: string;
	}

	/** a separator line, or a non-interactive label above a group of items */
	export type MenuEntry = MenuItem | 'separator' | { heading: string };
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		items,
		align = 'end',
		trigger
	}: {
		items: MenuEntry[];
		align?: 'start' | 'end';
		trigger: Snippet<[{ toggle: () => void; open: boolean }]>;
	} = $props();

	let open = $state(false);
	let root: HTMLElement;
	let menu: HTMLElement | undefined = $state();
	let pos = $state({ top: 0, left: 0 });

	// the menu lives in the top layer (popover) so overflow-hidden ancestors like panels can't clip it
	function place() {
		if (!menu) return;
		const r = root.getBoundingClientRect();
		const m = menu.getBoundingClientRect();
		const gap = 4;
		const below = innerHeight - r.bottom;
		const top = below < m.height + gap && r.top > below ? r.top - m.height - gap : r.bottom + gap;
		const left = align === 'end' ? r.right - m.width : r.left;
		pos = {
			top: Math.max(gap, top),
			left: Math.min(Math.max(gap, left), innerWidth - m.width - gap)
		};
	}

	$effect(() => {
		if (!open || !menu) return;
		menu.showPopover();
		place();
		const onScroll = (e: Event) => {
			if (!menu?.contains(e.target as Node)) open = false;
		};
		addEventListener('scroll', onScroll, true);
		addEventListener('resize', place);
		return () => {
			removeEventListener('scroll', onScroll, true);
			removeEventListener('resize', place);
		};
	});
</script>

<svelte:window
	onpointerdown={(e) => {
		if (open && !root.contains(e.target as Node)) open = false;
	}}
	onkeydown={(e) => {
		if (open && e.key === 'Escape') open = false;
	}}
/>

<div class="relative" bind:this={root}>
	{@render trigger({ toggle: () => (open = !open), open })}
	{#if open}
		<div
			role="menu"
			popover="manual"
			bind:this={menu}
			style:top="{pos.top}px"
			style:left="{pos.left}px"
			class="fixed inset-auto m-0 max-h-[70vh] min-w-44 overflow-auto rounded-lg border border-line bg-surface p-1 text-fg shadow-xl"
		>
			{#each items as item, i (i)}
				{#if item === 'separator'}
					<div class="my-1 h-px bg-line"></div>
				{:else if 'heading' in item}
					<p class="px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
						{item.heading}
					</p>
				{:else}
					<svelte:element
						this={item.href ? 'a' : 'button'}
						href={item.href}
						type={item.href ? undefined : 'button'}
						role="menuitem"
						tabindex="0"
						class={[
							'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2',
							item.danger ? 'text-critical' : 'text-fg'
						]}
						onclick={() => {
							open = false;
							item.onclick?.();
						}}
					>
						{#if item.icon}<item.icon class="size-4 text-muted" />{/if}
						<span class="flex-1">{item.label}</span>
						{#if item.shortcut}<kbd class="text-[11px] text-muted">{item.shortcut}</kbd>{/if}
					</svelte:element>
				{/if}
			{/each}
		</div>
	{/if}
</div>
