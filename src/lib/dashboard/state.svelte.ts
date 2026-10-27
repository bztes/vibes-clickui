import { createContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { page } from '$app/state';
import { getDashboardVariableOptions, getVariableOptions } from '#lib/remote/query.remote.ts';
import { setParams } from '#lib/url-state.ts';
import { SERIES_COLOR_VARS } from '#lib/format.ts';
import type { VariableValues } from '#lib/query/macros.ts';
import { compact, findFreeSpot } from './layout.ts';
import {
	customOptions,
	newId,
	normalizePanel,
	type DashboardExport,
	type DashboardModel,
	type DashboardRecord,
	type Panel
} from './types.ts';

export const ALL = '$__all';

export interface VariableState {
	options: string[];
	value: string | string[];
	isAll: boolean;
	loading: boolean;
	error?: string;
}

export class DashboardState {
	id: string;
	version = $state(0);
	title = $state('');
	description = $state('');
	tags = $state<string[]>([]);
	starred = $state(false);
	/** viewers can't edit, and their queries run from the saved dashboard on the server */
	canEdit: boolean;
	model = $state<DashboardModel>() as DashboardModel;

	/** JSON snapshot of the last saved state, for the dirty check */
	saved = $state('');
	editing = $state(false);
	/** a panel is being moved or resized; saving waits until it's dropped */
	dragging = $state(false);
	/** incremented to refresh every panel */
	tick = $state(0);

	constructor(record: DashboardRecord, editing = false) {
		this.id = record.id;
		this.version = record.version;
		this.title = record.title;
		this.description = record.description;
		this.tags = record.tags;
		this.starred = record.starred;
		this.model = structuredClone(record.model);
		this.saved = this.snapshot();
		this.canEdit = record.canEdit;
		this.editing = editing && record.canEdit;
	}

	toExport(): DashboardExport {
		return {
			title: this.title,
			description: this.description,
			tags: $state.snapshot(this.tags),
			model: $state.snapshot(this.model)
		};
	}

	snapshot() {
		return JSON.stringify(this.toExport());
	}

	dirty = $derived(this.snapshot() !== this.saved);

	/** `snapshot` is what was sent, so edits made while the save was in flight stay dirty */
	markSaved(version: number, snapshot = this.snapshot()) {
		this.version = version;
		this.saved = snapshot;
	}

	/** replaces everything from an edited JSON model */
	replace(data: DashboardExport) {
		this.title = data.title;
		this.description = data.description;
		this.tags = data.tags;
		this.model = data.model;
	}

	// --- time range & refresh live in the URL, falling back to the saved defaults ---

	from = $derived(page.url.searchParams.get('from') ?? this.model.time.from);
	to = $derived(page.url.searchParams.get('to') ?? this.model.time.to);

	setTime(from: string, to: string) {
		void setParams({ from, to });
	}

	setRefresh(value: string) {
		void setParams({ refresh: value || 'off' });
	}

	refreshInterval = $derived.by(() => {
		const refresh = page.url.searchParams.get('refresh') ?? this.model.refresh;
		return refresh === 'off' ? '' : refresh;
	});

	/** pinned series colors as CSS variables, shared by every panel */
	seriesColorVars = $derived(
		Object.fromEntries(
			Object.entries(this.model.seriesColors).map(([name, color]) => [
				name,
				SERIES_COLOR_VARS[color]
			])
		)
	);

	/** color keys each rendered panel currently shows (keyed by the rendering component) */
	shownColorKeys = new SvelteMap<object, string[]>();

	/** every key that is pinned or shown somewhere, for the color settings */
	colorKeys = $derived(
		[...Object.keys(this.model.seriesColors), ...[...this.shownColorKeys.values()].flat()]
			.filter((key, i, all) => all.indexOf(key) === i)
			.sort((a, b) => a.localeCompare(b))
	);

	// --- variables: values in the URL (`var-name`), options from queries ---

	variables = $derived.by(() => {
		const values: VariableValues = {};
		const allVars: string[] = [];
		const states: Record<string, VariableState> = {};
		let ready = true;

		for (const variable of this.model.variables) {
			let options: string[] = [];
			let loading = false;
			let error: string | undefined;

			if (variable.type === 'custom') {
				options = customOptions(variable);
			} else if (variable.type === 'query' && variable.query.trim()) {
				// earlier variables may be referenced by later ones
				const q = this.canEdit
					? getVariableOptions({
							datasource: variable.datasource,
							sql: variable.query,
							from: this.from,
							to: this.to,
							vars: { ...values }
						})
					: getDashboardVariableOptions({
							dashboardId: this.id,
							name: variable.name,
							from: this.from,
							to: this.to,
							vars: { ...values },
							allVars: [...allVars]
						});
				if (q.current) {
					options = q.current.options;
					error = q.current.error;
				} else if (q.error) {
					error = q.error.message;
				} else {
					loading = true;
					ready = false;
				}
			}

			const fromUrl = page.url.searchParams.getAll(`var-${variable.name}`);
			let value: string | string[];
			let isAll = false;
			if (variable.type === 'textbox') {
				value = fromUrl[0] ?? variable.query;
			} else if (variable.includeAll && (fromUrl.includes(ALL) || fromUrl.length === 0)) {
				value = options;
				isAll = true;
				allVars.push(variable.name);
			} else if (fromUrl.length) {
				value = variable.multi ? fromUrl : fromUrl[0];
			} else {
				value = variable.multi ? options.slice(0, 1) : (options[0] ?? '');
			}
			values[variable.name] = value;
			states[variable.name] = { options, value, isAll, loading, error };
		}

		return { values, allVars, states, ready };
	});

	setVariable(name: string, value: string | string[]) {
		void setParams({ [`var-${name}`]: value });
	}

	// --- panels ---

	panel(id: string) {
		return this.model.panels.find((p) => p.id === id);
	}

	/** a blank panel for the editor; it joins the dashboard once applied */
	newPanel(): Panel {
		return normalizePanel({
			id: newId(),
			type: 'timeseries',
			gridPos: { x: 0, y: 0, w: 12, h: 8 }
		});
	}

	/** replaces the panel with the same id, or adds it in the first free spot that fits */
	updatePanel(panel: Panel) {
		const index = this.model.panels.findIndex((p) => p.id === panel.id);
		if (index !== -1) this.model.panels[index] = panel;
		else
			this.model.panels.push({
				...panel,
				gridPos: findFreeSpot(this.model.panels, panel.gridPos.w, panel.gridPos.h)
			});
	}

	/** adds a copy of the panel, or of `source` (e.g. an editor's draft), and returns its id */
	duplicatePanel(id: string, source = this.panel(id)) {
		if (!source) return;
		const copy = $state.snapshot(source);
		copy.id = newId();
		copy.title = `${copy.title} (copy)`;
		copy.gridPos = findFreeSpot(this.model.panels, copy.gridPos.w, copy.gridPos.h);
		this.model.panels.push(copy);
		return copy.id;
	}

	removePanel(id: string) {
		this.model.panels = this.model.panels.filter((p) => p.id !== id);
		this.compact();
	}

	compact() {
		const positions = compact(this.model.panels);
		for (const p of this.model.panels) {
			const pos = positions.get(p.id);
			if (pos && (pos.y !== p.gridPos.y || pos.x !== p.gridPos.x)) p.gridPos = pos;
		}
	}
}

export const [getDashboardState, setDashboardState] = createContext<DashboardState>();

/** The surrounding dashboard's state, or `undefined` when rendered outside one (e.g. Explore). */
export function findDashboardState() {
	try {
		return getDashboardState();
	} catch {
		return undefined;
	}
}
