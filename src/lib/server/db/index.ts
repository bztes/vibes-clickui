import { drizzle } from 'drizzle-orm/libsql';
import { migrate as runMigrations } from 'drizzle-orm/libsql/migrator';
import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from './schema';
import { building } from '$app/env';
import { DATA_DIR } from '$app/env/private';

if (!building) mkdirSync(DATA_DIR, { recursive: true });
const client = createClient({
	url: building ? ':memory:' : `file:${join(DATA_DIR, 'vibes-clickui.db')}`
});

export const db = drizzle(client, { schema });

export async function migrate() {
	await runMigrations(db, { migrationsFolder: process.env.MIGRATIONS_DIR ?? 'drizzle' });
}
