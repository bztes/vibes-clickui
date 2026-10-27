<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { input } from './variants.ts';

	type Props = Omit<HTMLInputAttributes, 'size'> & {
		size?: 'sm' | 'md';
		mono?: boolean;
		value?: unknown;
	};

	let { size, mono, class: className, value = $bindable(), ...rest }: Props = $props();
</script>

<input bind:value class={input({ size, mono, class: className as string })} {...rest} />
