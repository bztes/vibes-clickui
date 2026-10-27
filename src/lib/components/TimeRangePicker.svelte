<script lang="ts">
	import ClockIcon from '@lucide/svelte/icons/clock';
	import ZoomOutIcon from '@lucide/svelte/icons/zoom-out';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import Button from '#lib/components/ui/Button.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import {
		QUICK_RANGES,
		describeRange,
		parseTime,
		resolveRange,
		formatDateTime
	} from '#lib/time.ts';

	let {
		from,
		to,
		onchange
	}: { from: string; to: string; onchange: (from: string, to: string) => void } = $props();

	let open = $state(false);
	let root: HTMLElement;
	let fromInput = $state('');
	let toInput = $state('');
	let search = $state('');

	function show() {
		const fmt = (expr: string) =>
			expr.startsWith('now') ? expr : formatDateTime(parseTime(expr) ?? Date.now());
		fromInput = fmt(from);
		toInput = fmt(to);
		search = '';
		open = true;
	}

	const fromValid = $derived(parseTime(fromInput) !== null);
	const toValid = $derived(parseTime(toInput) !== null);

	function apply() {
		if (!fromValid || !toValid) return;
		const norm = (v: string) => (v.trim().startsWith('now') ? v.trim() : String(parseTime(v)));
		onchange(norm(fromInput), norm(toInput));
		open = false;
	}

	/** shifts the range by half its width, like Grafana's arrows */
	function shift(direction: -1 | 1) {
		const r = resolveRange(from, to);
		const span = r.to - r.from;
		onchange(String(r.from + (direction * span) / 2), String(r.to + (direction * span) / 2));
	}

	function zoomOut() {
		const r = resolveRange(from, to);
		const span = r.to - r.from;
		const end = Math.min(Date.now(), r.to + span / 2);
		onchange(String(Math.round(end - span * 2)), to === 'now' ? 'now' : String(Math.round(end)));
	}

	const ranges = $derived(
		QUICK_RANGES.filter((r) => r.label.toLowerCase().includes(search.toLowerCase()))
	);
</script>

<svelte:window
	onpointerdown={(e) => {
		if (open && !root.contains(e.target as Node)) open = false;
	}}
	onkeydown={(e) => {
		if (open && e.key === 'Escape') open = false;
	}}
/>

<div class="relative flex items-center" bind:this={root}>
	<Button
		size="icon"
		class="rounded-r-none"
		onclick={() => shift(-1)}
		aria-label="Move time range back"
	>
		<ChevronLeftIcon />
	</Button>
	<Button
		class="-ml-px rounded-none"
		onclick={() => (open ? (open = false) : show())}
		aria-expanded={open}
	>
		<ClockIcon />
		<span class="max-w-64 truncate">{describeRange(from, to)}</span>
	</Button>
	<Button
		size="icon"
		class="-ml-px rounded-none"
		onclick={() => shift(1)}
		aria-label="Move time range forward"
	>
		<ChevronRightIcon />
	</Button>
	<Button
		size="icon"
		class="-ml-px rounded-l-none"
		onclick={zoomOut}
		aria-label="Zoom out time range"
	>
		<ZoomOutIcon />
	</Button>

	{#if open}
		<div
			class="absolute top-full right-0 z-50 mt-1 flex w-[min(34rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface shadow-xl max-sm:flex-col"
		>
			<form
				class="flex flex-1 flex-col gap-3 border-line p-4 sm:border-r"
				onsubmit={(e) => {
					e.preventDefault();
					apply();
				}}
			>
				<p class="text-xs font-semibold text-fg">Absolute time range</p>
				<label class="flex flex-col gap-1 text-xs text-fg-2">
					From
					<Input mono bind:value={fromInput} aria-invalid={!fromValid} placeholder="now-1h" />
				</label>
				<label class="flex flex-col gap-1 text-xs text-fg-2">
					To
					<Input mono bind:value={toInput} aria-invalid={!toValid} placeholder="now" />
				</label>
				<p class="text-[11px] leading-relaxed text-muted">
					Use <code class="font-mono">now-6h</code>, <code class="font-mono">now/d</code> or a date
					like
					<code class="font-mono">2026-01-31 12:00</code>.
				</p>
				<Button type="submit" variant="primary" disabled={!fromValid || !toValid}
					>Apply time range</Button
				>
			</form>
			<div class="flex w-full flex-col gap-1 p-2 sm:w-52">
				<Input size="sm" placeholder="Search quick ranges" bind:value={search} />
				<ul class="max-h-72 overflow-auto">
					{#each ranges as range (range.label)}
						<li>
							<button
								type="button"
								class={[
									'w-full cursor-pointer rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2',
									range.from === from && range.to === to
										? 'bg-surface-2 font-medium text-accent'
										: 'text-fg'
								]}
								onclick={() => {
									onchange(range.from, range.to);
									open = false;
								}}
							>
								{range.label}
							</button>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	{/if}
</div>
