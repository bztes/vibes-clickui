import * as v from 'valibot';
import { error, invalid } from '@sveltejs/kit';
import { command, form, query } from '$app/server';
import { asc, count, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { datasource } from '#lib/server/db/schema.ts';
import { requireAdmin } from '#lib/server/guard.ts';
import { encrypt, tryDecrypt } from '#lib/server/crypto.ts';
import { createConnection, errorMessage, forgetConnection } from '#lib/server/clickhouse.ts';

export const listDatasources = query(async () => {
	requireAdmin();
	const rows = await db.select().from(datasource).orderBy(asc(datasource.name));
	// never send passwords to the browser
	return rows.map(({ passwordEnc, ...ds }) => ({
		...ds,
		hasPassword: passwordEnc !== '',
		/** encrypted with a different BETTER_AUTH_SECRET; must be re-entered */
		passwordUnreadable: passwordEnc !== '' && tryDecrypt(passwordEnc) === null
	}));
});

const SettingsSchema = v.object({
	url: v.pipe(v.string(), v.trim(), v.url('Enter a URL like http://localhost:8123')),
	username: v.pipe(v.string(), v.trim(), v.nonEmpty('Enter a user name')),
	_password: v.optional(v.string(), ''),
	database: v.pipe(v.string(), v.trim(), v.nonEmpty('Enter a database'))
});

async function testConnection(settings: {
	url: string;
	username: string;
	password: string;
	database: string;
}) {
	const client = createConnection(settings);
	try {
		const result = await client.query({
			query: `SELECT version() AS version, (SELECT groupArray(name) FROM system.tables WHERE database = currentDatabase()) AS tables`,
			format: 'JSONEachRow',
			clickhouse_settings: { readonly: '2' }
		});
		const [row] = await result.json<{ version: string; tables: string[] }>();
		return { ok: true as const, version: row.version, tables: new Set(row.tables).size };
	} catch (e) {
		return { ok: false as const, error: errorMessage(e) };
	} finally {
		await client.close();
	}
}

export const saveDatasource = form(
	v.object({
		id: v.optional(v.string(), ''),
		name: v.pipe(v.string(), v.trim(), v.nonEmpty('Give the data source a name')),
		...SettingsSchema.entries,
		isDefault: v.optional(v.boolean(), false)
	}),
	async ({ id, name, url, username, _password, database, isDefault }, issue) => {
		requireAdmin();
		const existing = id
			? (await db.select().from(datasource).where(eq(datasource.id, id)))[0]
			: undefined;
		if (id && !existing) error(404, 'Data source not found');
		// an empty password field keeps the stored password
		const password = _password || (existing ? (tryDecrypt(existing.passwordEnc) ?? '') : '');

		const test = await testConnection({ url, username, password, database });
		if (!test.ok) invalid(issue.url(`Connection failed: ${test.error}`));

		const [{ n }] = await db.select({ n: count() }).from(datasource);
		const makeDefault = isDefault || n === 0 || (existing?.isDefault ?? false);
		if (makeDefault) await db.update(datasource).set({ isDefault: false });

		const values = {
			name,
			url,
			username,
			passwordEnc: encrypt(password),
			database,
			isDefault: makeDefault,
			updatedAt: new Date()
		};
		if (existing) {
			await db.update(datasource).set(values).where(eq(datasource.id, existing.id));
			forgetConnection(existing.id);
		} else {
			await db.insert(datasource).values(values);
		}
		void listDatasources().refresh();
		return { saved: true, version: test.version, tables: test.tables };
	}
);

/** Tests settings before saving. An empty password with an `id` uses the stored one. */
export const testDatasource = command(
	v.object({ id: v.optional(v.string(), ''), ...SettingsSchema.entries }),
	async ({ id, url, username, _password, database }) => {
		requireAdmin();
		let password = _password;
		if (!password && id) {
			const [existing] = await db.select().from(datasource).where(eq(datasource.id, id));
			password = existing ? (tryDecrypt(existing.passwordEnc) ?? '') : '';
		}
		return testConnection({ url, username, password, database });
	}
);

export const setDefaultDatasource = command(v.string(), async (id) => {
	requireAdmin();
	await db.update(datasource).set({ isDefault: false });
	await db.update(datasource).set({ isDefault: true }).where(eq(datasource.id, id));
	void listDatasources().refresh();
});

export const deleteDatasource = command(v.string(), async (id) => {
	requireAdmin();
	const [ds] = await db.select().from(datasource).where(eq(datasource.id, id));
	if (!ds) return;
	await db.delete(datasource).where(eq(datasource.id, id));
	forgetConnection(id);
	if (ds.isDefault) {
		const [next] = await db.select().from(datasource).orderBy(asc(datasource.name)).limit(1);
		if (next)
			await db.update(datasource).set({ isDefault: true }).where(eq(datasource.id, next.id));
	}
	void listDatasources().refresh();
});
