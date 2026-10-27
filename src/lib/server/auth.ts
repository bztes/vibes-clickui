import { ORIGIN, BETTER_AUTH_SECRET } from '$app/env/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { admin } from 'better-auth/plugins/admin';
import { getRequestEvent } from '$app/server';
import { building } from '$app/env';
import { db } from '#lib/server/db/index.ts';

export const auth = betterAuth({
	baseURL: ORIGIN,
	// a real secret is enforced at startup by src/env.ts; the placeholder only satisfies the build
	secret: BETTER_AUTH_SECRET || (building ? 'build-time-placeholder-secret-not-used' : undefined),
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	// no self sign-up: the first account is created via the login page, the rest by admins
	emailAndPassword: { enabled: true, minPasswordLength: 8, disableSignUp: true },
	plugins: [
		// roles: `admin` (full access) and `user` (viewer of granted dashboards)
		admin({ defaultRole: 'user', adminRoles: ['admin'] }),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
