<script lang="ts">
	import DashboardView from '#lib/components/dashboard/DashboardView.svelte';
	import { getDashboard } from '#lib/remote/dashboards.remote.ts';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();

	const record = $derived(await getDashboard(params.id));
</script>

{#key record.id}
	<DashboardView {record} />
{/key}
