<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import { input } from './variants.ts';

	type Props = HTMLTextareaAttributes & { mono?: boolean; value?: unknown };

	let { mono, class: className, value = $bindable(), ...rest }: Props = $props();
</script>

<textarea
	bind:value
	class={input({ mono, class: ['h-auto py-2 leading-relaxed', className as string] })}
	{...rest}></textarea>
