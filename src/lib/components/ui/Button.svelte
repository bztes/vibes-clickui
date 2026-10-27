<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import { button, type ButtonVariants } from './variants.ts';

	type Props = ButtonVariants & {
		children?: Snippet;
		class?: string;
	} & (
			| ({ href: string } & Omit<HTMLAnchorAttributes, 'class'>)
			| ({ href?: undefined } & Omit<HTMLButtonAttributes, 'class'>)
		);

	let { variant, size, active, class: className, children, ...rest }: Props = $props();
</script>

{#if rest.href !== undefined}
	<a class={button({ variant, size, active, class: className })} {...rest as HTMLAnchorAttributes}>
		{@render children?.()}
	</a>
{:else}
	<button
		type="button"
		class={button({ variant, size, active, class: className })}
		{...rest as HTMLButtonAttributes}
	>
		{@render children?.()}
	</button>
{/if}
