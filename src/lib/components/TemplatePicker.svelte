<script lang="ts" module>
	import type { Component } from 'svelte';

	export type TemplateChoice = {
		id: string;
		name: string;
		description?: string;
		icon: Component<{ class?: string }>;
	};
	export type TemplateGroup = { label?: string; items: TemplateChoice[] };
</script>

<script lang="ts">
	let {
		label,
		groups,
		value,
		onpick
	}: {
		label: string;
		groups: TemplateGroup[];
		value: string;
		onpick: (id: string) => void;
	} = $props();
</script>

<div class="flex flex-col gap-1">
	<span class="text-xs font-medium text-fg-2">{label}</span>
	<div
		class="max-h-72 overflow-y-auto rounded-lg border border-line bg-bg/40 p-2"
		role="radiogroup"
		aria-label={label}
	>
		{#each groups as group, i (group.label ?? i)}
			{#if group.label}
				<h3
					class="sticky -top-2 z-10 -mx-2 bg-surface/95 px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase backdrop-blur"
				>
					{group.label}
				</h3>
			{/if}
			<div class="grid grid-cols-2 gap-2 pb-2 max-sm:grid-cols-1">
				{#each group.items as t (t.id)}
					{@const Icon = t.icon}
					{@const selected = t.id === value}
					<button
						type="button"
						role="radio"
						aria-checked={selected}
						class={[
							'flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent',
							selected
								? 'border-accent bg-accent/10'
								: 'border-line bg-surface hover:border-line-strong hover:bg-surface-2'
						]}
						onclick={() => onpick(t.id)}
					>
						<span
							class={[
								'flex size-8 shrink-0 items-center justify-center rounded-md',
								selected ? 'bg-accent/20 text-accent' : 'bg-surface-2 text-fg-2'
							]}
						>
							<Icon class="size-4" />
						</span>
						<span class="flex min-w-0 flex-col">
							<span class="truncate text-sm font-medium text-fg">{t.name}</span>
							{#if t.description}
								<span class="line-clamp-2 text-xs text-muted">{t.description}</span>
							{/if}
						</span>
					</button>
				{/each}
			</div>
		{/each}
	</div>
</div>
