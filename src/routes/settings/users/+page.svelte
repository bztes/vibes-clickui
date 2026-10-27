<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import UsersIcon from '@lucide/svelte/icons/users';
	import Button from '#lib/components/ui/Button.svelte';
	import Input from '#lib/components/ui/Input.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import Field from '#lib/components/ui/Field.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import { getUser } from '#lib/remote/auth.remote.ts';
	import {
		createUser,
		deleteUser,
		listDashboardTitles,
		listUsers,
		setUserDashboards,
		setUserPassword,
		setUserRole
	} from '#lib/remote/users.remote.ts';
	import { timeAgo } from '#lib/time.ts';

	type User = Awaited<ReturnType<typeof listUsers>>[number];

	const [me, users, dashboards] = $derived(
		await Promise.all([getUser(), listUsers(), listDashboardTitles()])
	);

	let addOpen = $state(false);
	let accessFor = $state<User | null>(null);
	let accessIds = $state<string[]>([]);
	let passwordFor = $state<User | null>(null);
	let newPassword = $state('');
	let deleting = $state<User | null>(null);
	let actionError = $state('');

	const f = createUser.fields;
	const newRole = $derived(f.role.value() ?? 'user');

	function openAdd() {
		createUser.fields.set({ email: '', _password: '', role: 'user', dashboardIds: [] });
		addOpen = true;
	}

	function openAccess(user: User) {
		accessFor = user;
		accessIds = [...user.dashboardIds];
	}

	async function run(action: () => Promise<unknown>) {
		actionError = '';
		try {
			await action();
			return true;
		} catch (e) {
			actionError = e instanceof Error ? e.message : 'Something went wrong';
			return false;
		}
	}

	const dashboardTitle = (id: string) => dashboards.find((d) => d.id === id)?.title ?? id;
</script>

<svelte:head><title>Users · vibes-clickui</title></svelte:head>

<div class="mx-auto max-w-4xl p-6">
	<header class="mb-2 flex items-center gap-3">
		<h1 class="text-xl font-semibold">Users</h1>
		<Button variant="primary" class="ml-auto" onclick={openAdd}><PlusIcon /> Add user</Button>
	</header>
	<p class="mb-6 text-sm text-muted">
		<strong class="text-fg-2">Admins</strong> can do everything.
		<strong class="text-fg-2">Viewers</strong> can only open the dashboards you share with them — they
		can't edit dashboards or run their own queries.
	</p>

	{#if actionError}
		<p class="mb-4 rounded-md bg-critical/10 p-2.5 text-sm text-critical">{actionError}</p>
	{/if}

	<div class="overflow-x-auto rounded-lg border border-line bg-surface">
		<table class="w-full text-sm">
			<thead class="border-b border-line text-left text-xs text-fg-2">
				<tr>
					<th class="px-4 py-2 font-medium">Email</th>
					<th class="px-4 py-2 font-medium">Role</th>
					<th class="px-4 py-2 font-medium">Dashboards</th>
					<th class="px-4 py-2 font-medium max-sm:hidden">Created</th>
					<th class="px-4 py-2"></th>
				</tr>
			</thead>
			<tbody>
				{#each users as user (user.id)}
					{@const self = user.id === me?.id}
					<tr class="border-b border-line/60 last:border-0">
						<td class="px-4 py-2.5">
							{user.email}
							{#if self}<Badge tone="muted" class="ml-1">you</Badge>{/if}
						</td>
						<td class="px-4 py-2.5">
							<Select
								size="sm"
								class="w-28"
								value={user.role}
								disabled={self}
								title={self ? "You can't change your own role" : undefined}
								aria-label="Role of {user.email}"
								onchange={(e) =>
									run(() =>
										setUserRole({
											userId: user.id,
											role: e.currentTarget.value as 'admin' | 'user'
										})
									)}
							>
								<option value="admin">Admin</option>
								<option value="user">Viewer</option>
							</Select>
						</td>
						<td class="px-4 py-2.5">
							{#if user.role === 'admin'}
								<span class="text-muted">All</span>
							{:else}
								<button
									type="button"
									class="cursor-pointer text-left text-accent hover:underline"
									onclick={() => openAccess(user)}
									title={user.dashboardIds.map(dashboardTitle).join(', ')}
								>
									{user.dashboardIds.length === 0
										? 'None — share dashboards'
										: `${user.dashboardIds.length} dashboard${user.dashboardIds.length > 1 ? 's' : ''}`}
								</button>
							{/if}
						</td>
						<td class="px-4 py-2.5 text-xs text-muted max-sm:hidden">{timeAgo(user.createdAt)}</td>
						<td class="px-4 py-2.5">
							<div class="flex justify-end gap-1">
								<Button
									size="sm"
									variant="ghost"
									onclick={() => {
										passwordFor = user;
										newPassword = '';
									}}>Reset password</Button
								>
								{#if !self}
									<Button
										size="sm"
										variant="ghost"
										class="text-critical"
										onclick={() => (deleting = user)}>Delete</Button
									>
								{/if}
							</div>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="5" class="px-4 py-10 text-center text-muted">
							<UsersIcon class="mx-auto mb-2 size-6" />No users
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

{#snippet dashboardChecklist(selected: (id: string) => boolean, toggle: (id: string) => void)}
	<fieldset class="flex flex-col gap-1">
		<legend class="mb-1 text-xs font-medium text-fg-2">Dashboards this viewer can open</legend>
		<div class="max-h-64 overflow-auto rounded-md border border-line p-1">
			{#each dashboards as d (d.id)}
				<label
					class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-2"
				>
					<input
						type="checkbox"
						class="accent-accent"
						checked={selected(d.id)}
						onchange={() => toggle(d.id)}
					/>
					{d.title}
				</label>
			{:else}
				<p class="p-2 text-xs text-muted">No dashboards yet.</p>
			{/each}
		</div>
	</fieldset>
{/snippet}

<Dialog bind:open={addOpen} title="Add user">
	<form
		id="add-user"
		class="flex flex-col gap-3"
		{...createUser.enhance(async ({ submit }) => {
			if (await submit()) addOpen = false;
		})}
	>
		<Field label="Email" issues={f.email.issues()}>
			<Input {...f.email.as('email')} required autocomplete="off" />
		</Field>
		<Field
			label="Password"
			hint="At least 8 characters — share it with the user"
			issues={f._password.issues()}
		>
			<Input {...f._password.as('password')} required minlength={8} autocomplete="new-password" />
		</Field>
		<fieldset class="flex flex-col gap-1">
			<legend class="mb-1 text-xs font-medium text-fg-2">Role</legend>
			<label class="flex items-center gap-2 text-sm">
				<input {...f.role.as('radio', 'user')} class="accent-accent" />
				Viewer <span class="text-xs text-muted">— sees only the dashboards below</span>
			</label>
			<label class="flex items-center gap-2 text-sm">
				<input {...f.role.as('radio', 'admin')} class="accent-accent" />
				Admin <span class="text-xs text-muted">— full access</span>
			</label>
		</fieldset>
		{#if newRole === 'user'}
			<fieldset class="flex flex-col gap-1">
				<legend class="mb-1 text-xs font-medium text-fg-2">Dashboards this viewer can open</legend>
				<div class="max-h-56 overflow-auto rounded-md border border-line p-1">
					{#each dashboards as d (d.id)}
						<label
							class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-2"
						>
							<input {...f.dashboardIds.as('checkbox', d.id)} class="accent-accent" />
							{d.title}
						</label>
					{:else}
						<p class="p-2 text-xs text-muted">No dashboards yet.</p>
					{/each}
				</div>
			</fieldset>
		{/if}
		{#each f.allIssues()?.filter((i) => !i.path?.length) ?? [] as issue (issue.message)}
			<p class="text-sm text-critical">{issue.message}</p>
		{/each}
	</form>
	{#snippet footer()}
		<Button onclick={() => (addOpen = false)}>Cancel</Button>
		<Button type="submit" form="add-user" variant="primary" disabled={!!createUser.pending}>
			{createUser.pending ? 'Creating…' : 'Create user'}
		</Button>
	{/snippet}
</Dialog>

<Dialog
	open={accessFor !== null}
	onclose={() => (accessFor = null)}
	title="Dashboard access · {accessFor?.email ?? ''}"
>
	{@render dashboardChecklist(
		(id) => accessIds.includes(id),
		(id) =>
			(accessIds = accessIds.includes(id) ? accessIds.filter((x) => x !== id) : [...accessIds, id])
	)}
	{#snippet footer()}
		<Button onclick={() => (accessFor = null)}>Cancel</Button>
		<Button
			variant="primary"
			onclick={async () => {
				const user = accessFor;
				if (
					user &&
					(await run(() => setUserDashboards({ userId: user.id, dashboardIds: accessIds })))
				)
					accessFor = null;
			}}>Save access</Button
		>
	{/snippet}
</Dialog>

<Dialog
	open={passwordFor !== null}
	onclose={() => (passwordFor = null)}
	title="Reset password · {passwordFor?.email ?? ''}"
>
	<Field label="New password" hint="At least 8 characters">
		<Input type="password" bind:value={newPassword} minlength={8} autocomplete="new-password" />
	</Field>
	{#snippet footer()}
		<Button onclick={() => (passwordFor = null)}>Cancel</Button>
		<Button
			variant="primary"
			disabled={newPassword.length < 8}
			onclick={async () => {
				const user = passwordFor;
				if (user && (await run(() => setUserPassword({ userId: user.id, password: newPassword }))))
					passwordFor = null;
			}}>Set password</Button
		>
	{/snippet}
</Dialog>

<Dialog open={deleting !== null} onclose={() => (deleting = null)} title="Delete user">
	<p class="text-sm text-fg-2">
		Delete <strong class="text-fg">{deleting?.email}</strong>? They lose access immediately.
	</p>
	{#snippet footer()}
		<Button onclick={() => (deleting = null)}>Cancel</Button>
		<Button
			variant="danger"
			onclick={async () => {
				const user = deleting;
				if (user && (await run(() => deleteUser(user.id)))) deleting = null;
			}}>Delete</Button
		>
	{/snippet}
</Dialog>
