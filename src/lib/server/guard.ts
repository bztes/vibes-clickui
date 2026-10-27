import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { getRequestEvent } from '$app/server';
import { db } from './db/index.ts';
import { dashboardAccess } from './db/schema.ts';

export type Role = 'admin' | 'user';

export const isAdmin = (user: { role?: string | null }) => user.role === 'admin';

/** Throws 401 unless the current request belongs to a signed-in user. */
export function requireUser() {
	const { locals } = getRequestEvent();
	if (!locals.user) error(401, 'You need to sign in');
	return locals.user;
}

/** Throws 403 unless the current user is an admin. */
export function requireAdmin() {
	const user = requireUser();
	if (!isAdmin(user)) error(403, 'Only admins can do this');
	return user;
}

export async function canViewDashboard(
	user: { id: string; role?: string | null },
	dashboardId: string
) {
	if (isAdmin(user)) return true;
	const [row] = await db
		.select()
		.from(dashboardAccess)
		.where(and(eq(dashboardAccess.userId, user.id), eq(dashboardAccess.dashboardId, dashboardId)));
	return !!row;
}
