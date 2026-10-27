<script lang="ts">
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import Button from '#lib/components/ui/Button.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import { createFirstAdmin, getSetupRequired, signIn } from '#lib/remote/auth.remote.ts';

	const redirectTo = $derived(page.url.searchParams.get('redirectTo') ?? '/');
	const setupRequired = $derived(await getSetupRequired());
</script>

<svelte:head><title>Sign in · vibes-clickui</title></svelte:head>

<main class="flex min-h-dvh items-center justify-center p-4">
	<div class="w-full max-w-sm">
		<div class="mb-6 flex items-center gap-2.5">
			<img src={favicon} alt="" class="size-9" />
			<div>
				<h1 class="text-lg font-semibold">vibes-clickui</h1>
				<p class="text-xs text-muted">Dashboards for ClickHouse</p>
			</div>
		</div>

		<div class="rounded-xl border border-line bg-surface p-6 shadow-sm">
			{#if setupRequired}
				<h2 class="font-semibold">Create the admin account</h2>
				<p class="mt-1 mb-4 text-sm text-muted">
					This is the first account on this server. Admins add everyone else under Settings → Users.
				</p>
				<form {...createFirstAdmin} class="flex flex-col gap-3">
					<Field label="Email" issues={createFirstAdmin.fields.email.issues()}>
						<Input {...createFirstAdmin.fields.email.as('email')} autocomplete="email" required />
					</Field>
					<Field
						label="Password"
						hint="At least 8 characters"
						issues={createFirstAdmin.fields._password.issues()}
					>
						<Input
							{...createFirstAdmin.fields._password.as('password')}
							autocomplete="new-password"
							required
							minlength={8}
						/>
					</Field>
					{#each createFirstAdmin.fields
						.allIssues()
						?.filter((i) => !i.path?.length) ?? [] as issue (issue.message)}
						<p class="text-sm text-critical">{issue.message}</p>
					{/each}
					<Button type="submit" variant="primary" size="lg" disabled={!!createFirstAdmin.pending}>
						{createFirstAdmin.pending ? 'Creating account…' : 'Create admin account'}
					</Button>
				</form>
			{:else}
				<h2 class="mb-4 font-semibold">Sign in</h2>
				<form {...signIn} class="flex flex-col gap-3">
					<input {...signIn.fields.redirectTo.as('hidden', redirectTo)} />
					<Field label="Email" issues={signIn.fields.email.issues()}>
						<Input {...signIn.fields.email.as('email')} autocomplete="email" required />
					</Field>
					<Field label="Password" issues={signIn.fields._password.issues()}>
						<Input
							{...signIn.fields._password.as('password')}
							autocomplete="current-password"
							required
						/>
					</Field>
					{#each signIn.fields
						.allIssues()
						?.filter((i) => !i.path?.length) ?? [] as issue (issue.message)}
						<p class="text-sm text-critical">{issue.message}</p>
					{/each}
					<Button type="submit" variant="primary" size="lg" disabled={!!signIn.pending}>
						{signIn.pending ? 'Signing in…' : 'Sign in'}
					</Button>
				</form>
			{/if}
		</div>

		{#if !setupRequired}
			<p class="mt-4 text-center text-sm text-muted">No account? Ask an admin to create one.</p>
		{/if}
	</div>
</main>
