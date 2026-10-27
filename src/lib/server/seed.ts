import { asc, eq } from 'drizzle-orm';
import { db } from './db/index.ts';
import { user } from './db/schema.ts';

/**
 * Makes sure there is an admin: accounts created before roles existed have no role,
 * so the oldest account is promoted when nobody is admin yet.
 */
export async function ensureAdmin() {
	const [existing] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.role, 'admin'))
		.limit(1);
	if (existing) return;
	const [oldest] = await db
		.select({ id: user.id })
		.from(user)
		.orderBy(asc(user.createdAt))
		.limit(1);
	if (oldest) await db.update(user).set({ role: 'admin' }).where(eq(user.id, oldest.id));
}
