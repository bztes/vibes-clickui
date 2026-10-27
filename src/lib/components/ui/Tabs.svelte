<script lang="ts" module>
	import { createContext, untrack, type Snippet } from 'svelte';
	import type { ClassValue } from 'svelte/elements';

	type TabItem = { readonly id: string; readonly value: string; readonly label: string };

	type TabsContext = {
		readonly value: string;
		register(tab: TabItem): () => void;
	};

	export const [getTabsContext, setTabsContext] = createContext<TabsContext>();
</script>

<script lang="ts" generics="T extends string">
	let {
		value = $bindable(),
		class: className,
		headerClass,
		actions,
		children
	}: {
		/** the active tab's value, the first tab when unset */
		value?: T;
		class?: ClassValue;
		headerClass?: ClassValue;
		/** rendered next to the tab buttons */
		actions?: Snippet;
		children: Snippet;
	} = $props();

	const tabs: TabItem[] = $state([]);
	const buttons: HTMLButtonElement[] = $state([]);

	const active = $derived(value ?? tabs[0]?.value);

	setTabsContext({
		get value() {
			return active;
		},
		register(tab) {
			untrack(() => tabs.push(tab));
			return () => {
				const i = untrack(() => tabs.indexOf(tab));
				if (i !== -1) tabs.splice(i, 1);
			};
		}
	});

	function onkeydown(e: KeyboardEvent, i: number) {
		const next = {
			ArrowLeft: i - 1,
			ArrowRight: i + 1,
			Home: 0,
			End: tabs.length - 1
		}[e.key];
		if (next === undefined) return;
		e.preventDefault();
		const j = (next + tabs.length) % tabs.length;
		value = tabs[j].value as T;
		buttons[j]?.focus();
	}
</script>

<div class={['flex min-h-0 flex-col', className]}>
	<div class={['flex items-center gap-2', headerClass]}>
		<div class="flex flex-1 gap-1 border-b border-line" role="tablist">
			{#each tabs as tab, i (tab.value)}
				<button
					bind:this={buttons[i]}
					type="button"
					role="tab"
					id="{tab.id}-tab"
					aria-selected={active === tab.value}
					aria-controls="{tab.id}-panel"
					tabindex={active === tab.value ? 0 : -1}
					class={[
						'-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent',
						active === tab.value
							? 'border-accent text-fg'
							: 'border-transparent text-muted hover:text-fg'
					]}
					onclick={() => (value = tab.value as T)}
					onkeydown={(e) => onkeydown(e, i)}
				>
					{tab.label}
				</button>
			{/each}
		</div>
		{#if actions}
			<div class="flex items-center gap-2">{@render actions()}</div>
		{/if}
	</div>
	<!-- panels share one cell, so a kept-mounted panel holds the height when another is shown -->
	<div class="grid min-h-0 flex-1 overflow-auto">
		{@render children()}
	</div>
</div>
