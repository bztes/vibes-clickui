<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import CheckIcon from '@lucide/svelte/icons/check';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import Input from '#lib/components/ui/Input.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import { ALL, getDashboardState } from '#lib/dashboard/state.svelte.ts';
	import type { Variable } from '#lib/dashboard/types.ts';

	const dash = getDashboardState();

	let openName = $state<string | null>(null);
	let filter = $state('');
	let root = $state<HTMLElement>();

	function label(variable: Variable) {
		const state = dash.variables.states[variable.name];
		if (!state) return '';
		if (state.isAll) return 'All';
		const v = state.value;
		if (Array.isArray(v))
			return v.length === 0
				? 'None'
				: v.length > 2
					? `${v.slice(0, 2).join(' + ')} +${v.length - 2}`
					: v.join(' + ');
		return v || 'None';
	}

	function selected(variable: Variable, option: string) {
		const state = dash.variables.states[variable.name];
		if (!state || state.isAll) return false;
		return Array.isArray(state.value) ? state.value.includes(option) : state.value === option;
	}

	function choose(variable: Variable, option: string) {
		const state = dash.variables.states[variable.name];
		if (option === ALL || !variable.multi) {
			dash.setVariable(variable.name, option);
			openName = null;
			return;
		}
		const current = state?.isAll ? [] : Array.isArray(state?.value) ? state.value : [];
		const next = current.includes(option)
			? current.filter((v) => v !== option)
			: [...current, option];
		dash.setVariable(variable.name, next.length ? next : variable.includeAll ? ALL : []);
	}
</script>

<svelte:window
	onpointerdown={(e) => {
		if (openName && !root?.contains(e.target as Node)) openName = null;
	}}
/>

{#if dash.model.variables.length}
	<div class="flex flex-wrap items-center gap-2" bind:this={root}>
		{#each dash.model.variables as variable (variable.name)}
			{@const state = dash.variables.states[variable.name]}
			<div class="relative flex items-center text-sm">
				<span
					class="flex h-8 items-center rounded-l-md border border-line bg-surface-2 px-2.5 text-xs font-medium text-fg-2"
				>
					{variable.label || variable.name}
				</span>
				{#if variable.type === 'textbox'}
					<Input
						class="-ml-px w-44 rounded-l-none"
						value={state?.value as string}
						onkeydown={(e) => {
							if (e.key === 'Enter') dash.setVariable(variable.name, e.currentTarget.value);
						}}
						onblur={(e) => dash.setVariable(variable.name, e.currentTarget.value)}
					/>
				{:else}
					<button
						type="button"
						class="-ml-px flex h-8 max-w-72 min-w-24 cursor-pointer items-center gap-2 rounded-r-md border border-line bg-surface px-2.5 text-left hover:bg-surface-2"
						aria-haspopup="listbox"
						aria-expanded={openName === variable.name}
						onclick={() => {
							filter = '';
							openName = openName === variable.name ? null : variable.name;
						}}
					>
						<span class="truncate">{label(variable)}</span>
						{#if state?.loading}<Spinner class="size-3.5" />{/if}
						{#if state?.error}<span title={state.error} class="text-critical"
								><TriangleAlertIcon class="size-3.5" /></span
							>{/if}
						<ChevronDownIcon class="ml-auto size-3.5 shrink-0 text-muted" />
					</button>
					{#if openName === variable.name && state}
						{@const options = state.options.filter((o) =>
							o.toLowerCase().includes(filter.toLowerCase())
						)}
						<div
							class="absolute top-full left-0 z-50 mt-1 w-64 rounded-lg border border-line bg-surface p-1 shadow-xl"
						>
							{#if state.options.length > 8}
								<Input size="sm" class="mb-1" placeholder="Filter" bind:value={filter} />
							{/if}
							<ul
								class="max-h-72 overflow-auto"
								role="listbox"
								aria-label={variable.label || variable.name}
								aria-multiselectable={variable.multi}
							>
								{#if variable.includeAll}
									<li role="option" aria-selected={state.isAll}>
										<button
											type="button"
											class="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-2"
											onclick={() => choose(variable, ALL)}
										>
											<span class="flex size-4 items-center justify-center"
												>{#if state.isAll}<CheckIcon class="size-4 text-accent" />{/if}</span
											>
											All
										</button>
									</li>
								{/if}
								{#each options as option (option)}
									<li role="option" aria-selected={selected(variable, option)}>
										<button
											type="button"
											class="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-2"
											onclick={() => choose(variable, option)}
										>
											<span class="flex size-4 items-center justify-center"
												>{#if selected(variable, option)}<CheckIcon
														class="size-4 text-accent"
													/>{/if}</span
											>
											<span class="truncate">{option || '(empty)'}</span>
										</button>
									</li>
								{:else}
									<li class="px-2 py-1.5 text-xs text-muted">No values</li>
								{/each}
							</ul>
						</div>
					{/if}
				{/if}
			</div>
		{/each}
	</div>
{/if}
