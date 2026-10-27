import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { columnKind, type Column } from '#lib/query/result.ts';
import { tryDecrypt } from './crypto.ts';
import { db } from './db/index.ts';
import { datasource } from './db/schema.ts';

export interface ConnectionSettings {
	url: string;
	username: string;
	password: string;
	database: string;
}

export interface Connection {
	id: string;
	database: string;
	client: ClickHouseClient;
}

export function createConnection(settings: ConnectionSettings) {
	return createClient({
		url: settings.url,
		username: settings.username,
		password: settings.password,
		database: settings.database,
		application: 'vibes-clickui',
		request_timeout: 65_000
	});
}

/** clients are cached per data source and dropped whenever it is edited */
const clients = new Map<string, { updatedAt: number; connection: Connection }>();

export function forgetConnection(id: string) {
	const cached = clients.get(id);
	clients.delete(id);
	void cached?.connection.client.close();
}

/** Resolves a data source by id, falling back to the default one. */
export async function getConnection(id?: string): Promise<Connection> {
	// edits and deletes drop the cached client, so a hit is still current
	const hit = id && clients.get(id);
	if (hit) return hit.connection;
	const rows = await db
		.select()
		.from(datasource)
		.where(id ? eq(datasource.id, id) : eq(datasource.isDefault, true));
	let ds = rows[0];
	// a dashboard may reference a data source that was deleted — use the default instead
	if (!ds && id) [ds] = await db.select().from(datasource).where(eq(datasource.isDefault, true));
	if (!ds) [ds] = await db.select().from(datasource).limit(1);
	if (!ds) error(424, 'No data source configured. Add one under Settings → Data sources.');

	const cached = clients.get(ds.id);
	if (cached && cached.updatedAt === ds.updatedAt.getTime()) return cached.connection;
	if (cached) forgetConnection(ds.id);

	const password = tryDecrypt(ds.passwordEnc);
	if (password === null) {
		error(
			424,
			`The password of data source "${ds.name}" can't be decrypted — BETTER_AUTH_SECRET has probably changed. Re-enter it under Settings → Data sources.`
		);
	}
	const connection = {
		id: ds.id,
		database: ds.database,
		client: createConnection({ ...ds, password })
	};
	clients.set(ds.id, { updatedAt: ds.updatedAt.getTime(), connection });
	return connection;
}

export interface RawResult {
	columns: Column[];
	rows: unknown[][];
	elapsedMs: number;
	truncated: boolean;
}

function toMillis(value: unknown) {
	if (value === null || value === undefined) return value;
	if (typeof value === 'number') return value * 1000;
	const s = String(value);
	// Date/Date32 are always rendered as YYYY-MM-DD, DateTime(64) as unix seconds
	if (s.includes('-')) return Date.parse(s);
	return Math.round(Number.parseFloat(s) * 1e6) / 1e3;
}

/** Runs a SELECT and returns typed columns. Time columns become epoch milliseconds. */
export async function runSql(
	client: ClickHouseClient,
	sql: string,
	maxRows = 10_000
): Promise<RawResult> {
	const query = sql.trim().replace(/;+\s*$/, '');
	const started = performance.now();
	const result = await client.query({
		query,
		format: 'JSONCompactEachRowWithNamesAndTypes',
		clickhouse_settings: {
			readonly: '2',
			output_format_json_quote_64bit_integers: 0,
			output_format_json_quote_64bit_floats: 0,
			date_time_output_format: 'unix_timestamp',
			max_result_rows: String(maxRows),
			result_overflow_mode: 'break'
		}
	});
	const [names = [], types = [], ...rows] = await result.json<unknown[]>();
	const columns = (names as string[]).map((name, i) => {
		const type = String((types as string[])[i] ?? '');
		return { name, type, kind: columnKind(type) };
	});
	const timeIdx = columns.flatMap((c, i) => (c.kind === 'time' ? [i] : []));
	if (timeIdx.length) {
		for (const row of rows) for (const i of timeIdx) row[i] = toMillis(row[i]);
	}
	return {
		columns,
		rows: rows.slice(0, maxRows),
		elapsedMs: Math.round(performance.now() - started),
		truncated: rows.length >= maxRows
	};
}

export function errorMessage(e: unknown) {
	const message = e instanceof Error ? e.message : String(e);
	// strip the noisy stack trace ClickHouse appends to some errors
	return message.replace(/\s*Stack trace:[\s\S]*$/, '').trim();
}
