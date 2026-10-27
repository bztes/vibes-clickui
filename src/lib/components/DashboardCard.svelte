<script lang="ts">
	import StarIcon from '@lucide/svelte/icons/star';
	import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import type { ClassValue } from 'svelte/elements';
	import { resolve } from '$app/paths';
	import Badge from '#lib/components/ui/Badge.svelte';
	import { timeAgo } from '#lib/time.ts';

	let {
		dashboard,
		onstar,
		class: className
	}: {
		dashboard: {
			id: string;
			title: string;
			description: string;
			tags: string[];
			panelCount: number;
			updatedAt: Date;
			starred: boolean;
		};
		/** shows a star button; without it the star is only an indicator */
		onstar?: () => void;
		class?: ClassValue;
	} = $props();
</script>

<!-- the link is stretched over the card so the star button can sit on top of it -->
<div
	class={['group relative flex flex-col gap-2 p-4 transition-colors hover:bg-surface-2', className]}
>
	<div class="flex items-start gap-3">
		<span
			class={[
				'grid size-10 shrink-0 place-items-center rounded-lg',
				dashboard.starred ? 'bg-warning/12' : 'bg-accent/10'
			]}
		>
			<LayoutDashboardIcon class={['size-5', dashboard.starred ? 'text-warning' : 'text-accent']} />
		</span>
		<div class="min-w-0 flex-1">
			<a
				href={resolve('/dashboards/[id]', { id: dashboard.id })}
				class="block truncate font-semibold group-hover:text-accent after:absolute after:inset-0"
			>
				{dashboard.title}
			</a>
			<p class="text-xs text-muted">
				{dashboard.panelCount} panel{dashboard.panelCount === 1 ? '' : 's'} · updated {timeAgo(
					dashboard.updatedAt
				)}
			</p>
		</div>
		{#if onstar}
			<button
				type="button"
				class="relative z-10 -m-1 cursor-pointer rounded p-1 text-muted hover:text-warning"
				aria-label={dashboard.starred ? 'Unstar' : 'Star'}
				aria-pressed={dashboard.starred}
				onclick={onstar}
			>
				<StarIcon class={['size-4', dashboard.starred && 'fill-warning text-warning']} />
			</button>
		{:else if dashboard.starred}
			<StarIcon class="size-4 shrink-0 fill-warning text-warning" aria-label="Starred" />
		{:else}
			<ArrowRightIcon
				class="size-4 shrink-0 text-accent opacity-0 transition-opacity group-hover:opacity-100"
			/>
		{/if}
	</div>
	{#if dashboard.description}
		<p class="line-clamp-2 text-sm text-fg-2">{dashboard.description}</p>
	{/if}
	{#if dashboard.tags.length}
		<div class="mt-auto flex flex-wrap gap-1">
			{#each dashboard.tags as tag (tag)}<Badge>{tag}</Badge>{/each}
		</div>
	{/if}
</div>
