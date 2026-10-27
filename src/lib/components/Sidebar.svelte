<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
	import CompassIcon from '@lucide/svelte/icons/compass';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import UsersIcon from '@lucide/svelte/icons/users';
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { getUser, signOut } from '#lib/remote/auth.remote.ts';
	import { theme } from '#lib/theme.svelte.ts';

	const user = $derived(await getUser());

	// viewers only get dashboards; everything that runs ad-hoc SQL is admin-only
	const nav = $derived([
		{ href: resolve('/'), label: 'Dashboards', icon: LayoutDashboardIcon },
		...(user?.admin ? [{ href: resolve('/explore'), label: 'Explore', icon: CompassIcon }] : [])
	]);

	// the start page lists the dashboards, so it also owns /dashboards/…
	const active = (href: string) =>
		href === resolve('/')
			? href === page.url.pathname || page.url.pathname.startsWith(resolve('/dashboards'))
			: page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
</script>

<nav
	class="flex shrink-0 border-line bg-surface max-md:h-12 max-md:items-center max-md:gap-1 max-md:overflow-x-auto max-md:border-b max-md:px-2 md:w-14 md:flex-col md:items-center md:border-r md:py-3"
	aria-label="Main"
>
	<a
		href={resolve('/')}
		class="flex items-center max-md:mr-2 md:mb-4"
		aria-label="vibes-clickui home"
	>
		<img src={favicon} alt="" class="size-7" />
	</a>
	<!-- eslint-disable svelte/no-navigation-without-resolve -- callers pass resolve()d paths -->
	{#snippet item(href: string, label: string, Icon: typeof LayoutDashboardIcon, isActive: boolean)}
		<a
			{href}
			title={label}
			aria-label={label}
			aria-current={isActive ? 'page' : undefined}
			class={[
				'flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors md:mb-1',
				isActive ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg'
			]}
		>
			<Icon class="size-[18px]" />
		</a>
	{/snippet}
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{#each nav as n (n.href)}
		{@render item(n.href, n.label, n.icon, active(n.href))}
	{/each}
	<div
		class="max-md:ml-auto max-md:flex max-md:items-center max-md:gap-1 md:mt-auto md:flex md:flex-col md:items-center"
	>
		{#if user?.admin}
			{@render item(
				resolve('/settings/users'),
				'Users',
				UsersIcon,
				active(resolve('/settings/users'))
			)}
			{@render item(
				resolve('/settings/datasources'),
				'Data sources',
				DatabaseIcon,
				active(resolve('/settings/datasources'))
			)}
		{/if}
		<button
			type="button"
			class="flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg md:mb-1"
			onclick={() => theme.toggle()}
			aria-label="Toggle theme"
			title="Toggle theme"
		>
			{#if theme.current === 'dark'}<SunIcon class="size-[18px]" />{:else}<MoonIcon
					class="size-[18px]"
				/>{/if}
		</button>
		{#if user}
			<form {...signOut}>
				<button
					class="flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
					title="Sign out {user.email}"
					aria-label="Sign out"
				>
					<LogOutIcon class="size-[18px]" />
				</button>
			</form>
			<span
				class="mt-2 flex size-7 items-center justify-center rounded-full bg-violet/20 text-xs font-semibold text-violet max-md:hidden"
				title={user.email}
			>
				{user.email.slice(0, 1).toUpperCase()}
			</span>
		{/if}
	</div>
</nav>
