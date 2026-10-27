<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import Sidebar from '#lib/components/Sidebar.svelte';
	import { theme } from '#lib/theme.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const bare = $derived(page.route.id === '/login');

	$effect(() => theme.init());
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>vibes-clickui</title>
</svelte:head>

{#if bare}
	{@render children()}
{:else}
	<div class="flex h-dvh max-md:flex-col">
		<Sidebar />
		<div class="min-h-0 min-w-0 flex-1 overflow-auto">
			{@render children()}
		</div>
	</div>
{/if}
