import * as v from 'valibot';
import { DashboardExportSchema, PANEL_TYPES, PanelSchema, type PanelType } from './types.ts';

/** templates use the schema *input* type: everything with a default may be omitted */
type DashboardInput = v.InferInput<typeof DashboardExportSchema>;
type PanelInput = v.InferInput<typeof PanelSchema>;

/** A predefined dashboard: the export JSON, plus an optional group to list it under. */
export type DashboardTemplate = {
	id: string;
	group?: string;
	name: string;
	dashboard: DashboardInput;
};

/**
 * A predefined panel for "Add panel"; its gridPos only sets the size, the position is found later.
 * Its `type` may list several visualizations that show its query; the panel takes the first.
 */
export type PanelTemplate = {
	id: string;
	group?: string;
	name: string;
	description?: string;
	/** the visualizations it is offered for */
	types: PanelType[];
	panel: Omit<PanelInput, 'id'>;
};

const TemplateGroupSchema = v.object({ group: v.optional(v.string()) });

const PanelTemplateSchema = v.object({
	group: v.optional(v.string()),
	name: v.string(),
	description: v.optional(v.string()),
	panel: v.object({
		...v.omit(PanelSchema, ['id']).entries,
		type: v.union([
			v.picklist(PANEL_TYPES),
			v.pipe(v.array(v.picklist(PANEL_TYPES)), v.minLength(1))
		])
	})
});

/** the template id is the file name without extension */
const fileId = (path: string) => path.slice(path.lastIndexOf('/') + 1, -'.json'.length);

// predefined dashboards and panels live as JSON in /configs/<config>/{dashboards,panels}, validated when loaded
const dashboardFiles = import.meta.glob<unknown>('/configs/*/dashboards/*.json', {
	eager: true,
	import: 'default'
});
const panelFiles = import.meta.glob<unknown>('/configs/*/panels/*.json', {
	eager: true,
	import: 'default'
});

const byGroup = (a: { group?: string }, b: { group?: string }) =>
	(a.group ?? '').localeCompare(b.group ?? '');

export const TEMPLATES: DashboardTemplate[] = Object.entries(dashboardFiles)
	.map(([path, json]) => {
		const { group } = v.parse(TemplateGroupSchema, json);
		const dashboard = v.parse(DashboardExportSchema, json);
		return { id: fileId(path), group, name: dashboard.title, dashboard };
	})
	.sort(byGroup);

export const PANEL_TEMPLATES: PanelTemplate[] = Object.entries(panelFiles)
	.map(([path, json]) => {
		const { panel, ...t } = v.parse(PanelTemplateSchema, json);
		const types = [panel.type].flat();
		return { id: fileId(path), ...t, types, panel: { ...panel, type: types[0] } };
	})
	.sort(byGroup);

/** Templates grouped for a picker, groups sorted by name; the ungrouped ones come first, unlabeled. */
export function groupTemplates<T extends { group?: string }>(templates: T[]) {
	return Object.entries(Object.groupBy(templates, (t) => t.group ?? ''))
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([label, items]) => ({ label: label || undefined, templates: items ?? [] }));
}
