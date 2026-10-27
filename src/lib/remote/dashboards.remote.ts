import * as v from 'valibot';
import { error, invalid, redirect } from '@sveltejs/kit';
import { command, form, query } from '$app/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { dashboard, dashboardAccess, starredDashboard } from '#lib/server/db/schema.ts';
import { canViewDashboard, isAdmin, requireAdmin, requireUser } from '#lib/server/guard.ts';
import { findFreeSpot } from '#lib/dashboard/layout.ts';
import { TEMPLATES } from '#lib/dashboard/templates.ts';
import {
	DashboardExportSchema,
	PanelSchema,
	newId,
	parseStoredModel,
	type DashboardRecord
} from '#lib/dashboard/types.ts';

async function starredIds(userId: string) {
	const rows = await db
		.select({ id: starredDashboard.dashboardId })
		.from(starredDashboard)
		.where(eq(starredDashboard.userId, userId));
	return new Set(rows.map((r) => r.id));
}

export const listDashboards = query(async () => {
	const user = requireUser();
	const [rows, starred] = await Promise.all([
		isAdmin(user)
			? db.select().from(dashboard).orderBy(asc(dashboard.title))
			: db
					.select({ dashboard })
					.from(dashboard)
					.innerJoin(dashboardAccess, eq(dashboardAccess.dashboardId, dashboard.id))
					.where(eq(dashboardAccess.userId, user.id))
					.orderBy(asc(dashboard.title))
					.then((rows) => rows.map((r) => r.dashboard)),
		starredIds(user.id)
	]);
	return rows.map((d) => ({
		id: d.id,
		title: d.title,
		description: d.description,
		tags: d.tags,
		panelCount: d.model.panels.length,
		updatedAt: d.updatedAt,
		starred: starred.has(d.id)
	}));
});

export const getDashboard = query(v.string(), async (id): Promise<DashboardRecord> => {
	const user = requireUser();
	// viewers get the same 404 for dashboards they may not see
	const [canView, [d], starred] = await Promise.all([
		canViewDashboard(user, id),
		db.select().from(dashboard).where(eq(dashboard.id, id)),
		starredIds(user.id)
	]);
	if (!canView || !d) error(404, 'Dashboard not found');
	return {
		id: d.id,
		title: d.title,
		description: d.description,
		tags: d.tags,
		// re-parse so dashboards saved by older versions get new defaults
		model: parseStoredModel(d.model),
		version: d.version,
		updatedAt: d.updatedAt,
		starred: starred.has(d.id),
		canEdit: isAdmin(user)
	};
});

export const createDashboard = form(
	v.object({
		title: v.pipe(v.string(), v.trim(), v.nonEmpty('Give the dashboard a title')),
		description: v.optional(v.pipe(v.string(), v.trim()), ''),
		template: v.picklist(TEMPLATES.map((t) => t.id))
	}),
	async ({ title, description, template: templateId }) => {
		const user = requireAdmin();
		const template = TEMPLATES.find((t) => t.id === templateId)!;
		const base = v.parse(DashboardExportSchema, template.dashboard);
		const [created] = await db
			.insert(dashboard)
			.values({
				title,
				description: description || base.description,
				tags: base.tags,
				model: base.model,
				createdBy: user.id,
				updatedBy: user.id
			})
			.returning({ id: dashboard.id });
		redirect(303, `/dashboards/${created.id}`);
	}
);

export const importDashboard = form(
	v.object({ json: v.pipe(v.string(), v.nonEmpty('Paste a dashboard JSON model')) }),
	async ({ json }, issue) => {
		const user = requireAdmin();
		let raw: unknown;
		try {
			raw = JSON.parse(json);
		} catch {
			invalid(issue.json('This is not valid JSON'));
		}
		const parsed = v.safeParse(DashboardExportSchema, raw);
		if (!parsed.success) {
			const first = parsed.issues[0];
			const path = first.path?.map((p) => p.key).join('.') ?? '';
			invalid(issue.json(`Invalid dashboard${path ? ` at ${path}` : ''}: ${first.message}`));
		}
		const [created] = await db
			.insert(dashboard)
			.values({ ...parsed.output, createdBy: user.id, updatedBy: user.id })
			.returning({ id: dashboard.id });
		redirect(303, `/dashboards/${created.id}`);
	}
);

export const saveDashboard = command(
	v.object({
		id: v.string(),
		version: v.number(),
		dashboard: DashboardExportSchema,
		/** overwrite even if somebody else saved in the meantime */
		force: v.optional(v.boolean(), false)
	}),
	async ({ id, version, dashboard: data, force }) => {
		const user = requireAdmin();
		const [current] = await db
			.select({ version: dashboard.version })
			.from(dashboard)
			.where(eq(dashboard.id, id));
		if (!current) error(404, 'Dashboard not found');
		if (!force && current.version !== version) {
			return { conflict: true as const, version: current.version };
		}
		await db
			.update(dashboard)
			.set({
				...data,
				version: current.version + 1,
				updatedAt: new Date(),
				updatedBy: user.id
			})
			.where(eq(dashboard.id, id));
		void getDashboard(id).refresh();
		return { conflict: false as const, version: current.version + 1 };
	}
);

export const deleteDashboard = command(v.string(), async (id) => {
	requireAdmin();
	await db.delete(dashboard).where(eq(dashboard.id, id));
	void listDashboards().refresh();
});

export const duplicateDashboard = command(v.string(), async (id) => {
	const user = requireAdmin();
	const [d] = await db.select().from(dashboard).where(eq(dashboard.id, id));
	if (!d) error(404, 'Dashboard not found');
	const [created] = await db
		.insert(dashboard)
		.values({
			title: `${d.title} (copy)`,
			description: d.description,
			tags: d.tags,
			model: d.model,
			createdBy: user.id,
			updatedBy: user.id
		})
		.returning({ id: dashboard.id });
	void listDashboards().refresh();
	return created.id;
});

export const toggleStar = command(v.string(), async (id) => {
	const user = requireUser();
	if (!(await canViewDashboard(user, id))) error(404, 'Dashboard not found');
	const where = and(eq(starredDashboard.userId, user.id), eq(starredDashboard.dashboardId, id));
	const [existing] = await db.select().from(starredDashboard).where(where);
	if (existing) await db.delete(starredDashboard).where(where);
	else await db.insert(starredDashboard).values({ userId: user.id, dashboardId: id });
	void listDashboards().refresh();
	void getDashboard(id).refresh();
});

/** Appends a panel (e.g. from Explore) to the bottom of a dashboard and returns its id. */
export const addPanelToDashboard = command(
	v.object({ dashboardId: v.string(), panel: v.omit(PanelSchema, ['id', 'gridPos']) }),
	async ({ dashboardId, panel }) => {
		const user = requireAdmin();
		const [d] = await db.select().from(dashboard).where(eq(dashboard.id, dashboardId));
		if (!d) error(404, 'Dashboard not found');
		const model = parseStoredModel(d.model);
		const gridPos = findFreeSpot(model.panels, 12, 8);
		const id = newId();
		model.panels.push({ ...panel, id, gridPos });
		await db
			.update(dashboard)
			.set({ model, version: d.version + 1, updatedAt: new Date(), updatedBy: user.id })
			.where(eq(dashboard.id, dashboardId));
		void getDashboard(dashboardId).refresh();
		return id;
	}
);
