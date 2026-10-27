<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLSelectAttributes } from 'svelte/elements';
	import { input } from './variants.ts';

	type Props = Omit<HTMLSelectAttributes, 'size'> & {
		size?: 'sm' | 'md';
		value?: unknown;
		children?: Snippet;
	};

	let { size, class: className, value = $bindable(), children, ...rest }: Props = $props();
</script>

<select
	bind:value
	class={input({ size, class: ['cursor-pointer pr-7', className as string] })}
	{...rest}
>
	{@render children?.()}
</select>
