import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth.schema';
import type { DashboardModel } from '#lib/dashboard/types.ts';

export const dashboard = sqliteTable('dashboard', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	title: text('title').notNull(),
	description: text('description').notNull().default(''),
	tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
	model: text('model', { mode: 'json' }).$type<DashboardModel>().notNull(),
	version: integer('version').notNull().default(1),
	createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
	updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const datasource = sqliteTable('datasource', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: text('name').notNull(),
	type: text('type', { enum: ['clickhouse'] })
		.notNull()
		.default('clickhouse'),
	url: text('url').notNull(),
	username: text('username').notNull().default('default'),
	/** AES-GCM encrypted with a key derived from BETTER_AUTH_SECRET */
	passwordEnc: text('password_enc').notNull().default(''),
	database: text('database').notNull().default('default'),
	isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const starredDashboard = sqliteTable('starred_dashboard', {
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	dashboardId: text('dashboard_id')
		.notNull()
		.references(() => dashboard.id, { onDelete: 'cascade' })
});

/** dashboards a viewer (role `user`) may open; admins see everything */
export const dashboardAccess = sqliteTable(
	'dashboard_access',
	{
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		dashboardId: text('dashboard_id')
			.notNull()
			.references(() => dashboard.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.userId, t.dashboardId] })]
);

export * from './auth.schema';
