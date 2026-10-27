<script lang="ts">
	let {
		checked = $bindable(false),
		label,
		onchange
	}: { checked?: boolean; label: string; onchange?: (checked: boolean) => void } = $props();
</script>

<label class="inline-flex cursor-pointer items-center gap-2 text-xs text-fg-2 select-none">
	<input
		type="checkbox"
		role="switch"
		class="peer sr-only"
		bind:checked
		onchange={() => onchange?.(checked)}
	/>
	<span
		class="relative h-4 w-7 rounded-full bg-surface-3 transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent after:absolute after:top-0.5 after:left-0.5 after:size-3 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-3"
	></span>
	{label}
</label>
