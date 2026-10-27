import { redirect } from '@sveltejs/kit';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { auth } from '#lib/server/auth.ts';
import { isAdmin } from '#lib/server/guard.ts';
import { migrate } from '#lib/server/db/index.ts';
import { ensureAdmin } from '#lib/server/seed.ts';
import { svelteKitHandler } from 'better-auth/svelte-kit';

export const init: ServerInit = async () => {
	if (building) return;
	await migrate();
	await ensureAdmin();
};

const PUBLIC_PATHS = ['/login', '/api/auth', '/_app'];
/** pages that need the admin role; viewers only get dashboards */
const ADMIN_PATHS = ['/explore', '/settings'];

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	const { pathname } = event.url;
	// remote functions (under /_app) check auth themselves via requireUser()
	if (!event.locals.user && !building && !PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
		const target =
			pathname === '/' ? '' : `?redirectTo=${encodeURIComponent(pathname + event.url.search)}`;
		redirect(303, `/login${target}`);
	}

	if (
		event.locals.user &&
		!isAdmin(event.locals.user) &&
		ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
	) {
		redirect(303, '/');
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = handleBetterAuth;
