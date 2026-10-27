import * as v from 'valibot';
import { invalid, redirect } from '@sveltejs/kit';
import { form, getRequestEvent, query } from '$app/server';
import { APIError } from 'better-auth/api';
import { count } from 'drizzle-orm';
import { auth } from '#lib/server/auth.ts';
import { db } from '#lib/server/db/index.ts';
import { user } from '#lib/server/db/schema.ts';
import { isAdmin } from '#lib/server/guard.ts';

/** only allow redirects to local paths */
const safeRedirect = (target: string | undefined) =>
	target && target.startsWith('/') && !target.startsWith('//') ? target : '/';

const userCount = async () => (await db.select({ n: count() }).from(user))[0].n;

export const getUser = query(async () => {
	const { locals } = getRequestEvent();
	if (!locals.user) return null;
	const { id, email } = locals.user;
	return { id, email, admin: isAdmin(locals.user) };
});

/** Only the very first account can be created from the login page; it becomes the admin. */
export const getSetupRequired = query(async () => (await userCount()) === 0);

async function signInWithPassword(email: string, password: string) {
	await auth.api.signInEmail({
		body: { email, password },
		headers: getRequestEvent().request.headers
	});
}

export const signIn = form(
	v.object({
		email: v.pipe(v.string(), v.trim(), v.email('Enter a valid email address')),
		_password: v.pipe(v.string(), v.nonEmpty('Enter your password')),
		redirectTo: v.optional(v.string())
	}),
	async ({ email, _password, redirectTo }) => {
		try {
			await signInWithPassword(email, _password);
		} catch (e) {
			if (e instanceof APIError) invalid(e.message || 'Sign in failed');
			throw e;
		}
		redirect(303, safeRedirect(redirectTo));
	}
);

export const createFirstAdmin = form(
	v.object({
		email: v.pipe(v.string(), v.trim(), v.email('Enter a valid email address')),
		_password: v.pipe(v.string(), v.minLength(8, 'Use at least 8 characters'))
	}),
	async ({ email, _password }) => {
		if ((await userCount()) > 0) invalid('An admin already exists — ask them for an account');
		// no headers: a trusted server-side call, allowed without an admin session
		await auth.api.createUser({
			body: { email, password: _password, name: email, role: 'admin' }
		});
		await signInWithPassword(email, _password);
		redirect(303, '/settings/datasources');
	}
);

export const signOut = form(async () => {
	await auth.api.signOut({ headers: getRequestEvent().request.headers });
	redirect(303, '/login');
});
