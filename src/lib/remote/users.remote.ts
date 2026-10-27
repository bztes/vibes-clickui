import * as v from 'valibot';
import { error, invalid } from '@sveltejs/kit';
import { command, form, getRequestEvent, query } from '$app/server';
import { APIError } from 'better-auth/api';
import { asc, eq } from 'drizzle-orm';
import { auth } from '#lib/server/auth.ts';
import { db } from '#lib/server/db/index.ts';
import { dashboard, dashboardAccess, user } from '#lib/server/db/schema.ts';
import { requireAdmin } from '#lib/server/guard.ts';

const RoleSchema = v.picklist(['admin', 'user']);
const headers = () => getRequestEvent().request.headers;

export const listUsers = query(async () => {
	requireAdmin();
	const users = await db
		.select({ id: user.id, email: user.email, role: user.role, createdAt: user.createdAt })
		.from(user)
		.orderBy(asc(user.email));
	const access = await db.select().from(dashboardAccess);
	return users.map((u) => ({
		...u,
		role: u.role === 'admin' ? ('admin' as const) : ('user' as const),
		dashboardIds: access.filter((a) => a.userId === u.id).map((a) => a.dashboardId)
	}));
});

/** id + title of every dashboard, for the access checklist */
export const listDashboardTitles = query(async () => {
	requireAdmin();
	return db
		.select({ id: dashboard.id, title: dashboard.title })
		.from(dashboard)
		.orderBy(asc(dashboard.title));
});

export const createUser = form(
	v.object({
		email: v.pipe(v.string(), v.trim(), v.email('Enter a valid email address')),
		_password: v.pipe(v.string(), v.minLength(8, 'Use at least 8 characters')),
		role: RoleSchema,
		dashboardIds: v.optional(v.array(v.string()), [])
	}),
	async ({ email, _password, role, dashboardIds }, issue) => {
		requireAdmin();
		let created;
		try {
			created = await auth.api.createUser({
				body: { email, password: _password, name: email, role },
				headers: headers()
			});
		} catch (e) {
			if (e instanceof APIError) invalid(issue.email(e.message || 'Could not create the user'));
			throw e;
		}
		if (role === 'user' && dashboardIds.length) {
			await db
				.insert(dashboardAccess)
				.values(dashboardIds.map((dashboardId) => ({ userId: created.user.id, dashboardId })));
		}
		void listUsers().refresh();
		return { created: email };
	}
);

export const setUserRole = command(
	v.object({ userId: v.string(), role: RoleSchema }),
	async ({ userId, role }) => {
		const me = requireAdmin();
		if (userId === me.id && role !== 'admin') error(400, "You can't remove your own admin role");
		await auth.api.setRole({ body: { userId, role }, headers: headers() });
		void listUsers().refresh();
	}
);

export const setUserPassword = command(
	v.object({
		userId: v.string(),
		password: v.pipe(v.string(), v.minLength(8, 'Use at least 8 characters'))
	}),
	async ({ userId, password }) => {
		requireAdmin();
		await auth.api.setUserPassword({ body: { userId, newPassword: password }, headers: headers() });
	}
);

export const deleteUser = command(v.string(), async (userId) => {
	const me = requireAdmin();
	if (userId === me.id) error(400, "You can't delete your own account");
	await auth.api.removeUser({ body: { userId }, headers: headers() });
	void listUsers().refresh();
});

/** Replaces the dashboards a viewer may open. */
export const setUserDashboards = command(
	v.object({ userId: v.string(), dashboardIds: v.array(v.string()) }),
	async ({ userId, dashboardIds }) => {
		requireAdmin();
		await db.transaction(async (tx) => {
			await tx.delete(dashboardAccess).where(eq(dashboardAccess.userId, userId));
			if (dashboardIds.length) {
				await tx
					.insert(dashboardAccess)
					.values(dashboardIds.map((dashboardId) => ({ userId, dashboardId })));
			}
		});
		void listUsers().refresh();
	}
);
