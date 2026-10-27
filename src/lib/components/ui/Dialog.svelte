<script lang="ts">
	import type { Snippet } from 'svelte';
	import XIcon from '@lucide/svelte/icons/x';

	let {
		open = $bindable(false),
		title,
		class: className = 'w-[min(32rem,calc(100vw-2rem))]',
		children,
		footer,
		onclose
	}: {
		open?: boolean;
		onclose?: () => void;
		title: string;
		class?: string;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	function sync(dialog: HTMLDialogElement) {
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	}
</script>

<dialog
	{@attach (el) => sync(el as HTMLDialogElement)}
	onclose={() => {
		open = false;
		onclose?.();
	}}
	onclick={(e) => {
		if (e.target === e.currentTarget) (e.currentTarget as HTMLDialogElement).close();
	}}
	class={[
		'm-auto max-h-[calc(100vh-4rem)] overflow-hidden rounded-xl border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px]',
		className
	]}
>
	{#if open}
		<div class="flex max-h-[calc(100vh-4rem)] flex-col">
			<header class="flex items-center justify-between border-b border-line px-4 py-3">
				<h2 class="text-sm font-semibold">{title}</h2>
				<button
					type="button"
					class="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
					onclick={(e) => (e.currentTarget.closest('dialog') as HTMLDialogElement).close()}
					aria-label="Close"
				>
					<XIcon class="size-4" />
				</button>
			</header>
			<div class="min-h-0 flex-1 overflow-auto p-4">{@render children()}</div>
			{#if footer}
				<footer class="flex justify-end gap-2 border-t border-line px-4 py-3">
					{@render footer()}
				</footer>
			{/if}
		</div>
	{/if}
</dialog>
