import { describe, expect, it } from 'vitest';
import { groupTemplates, PANEL_TEMPLATES, TEMPLATES } from './templates.ts';

describe('templates', () => {
	it('loads the dashboards from configs/*/dashboards', () => {
		expect(TEMPLATES.map((t) => t.id)).toEqual([
			'blank',
			'demo',
			'infrastructure',
			'opentelemetry'
		]);
	});

	it('loads the panels from configs/*/panels, grouped', () => {
		expect(PANEL_TEMPLATES).toHaveLength(12);
		expect(PANEL_TEMPLATES[0].id).toBe('empty');
		expect(PANEL_TEMPLATES[1].group).toBe('ClickHouse');
		expect(PANEL_TEMPLATES.at(-1)?.group).toBe('OTel Collector');
	});

	it('offers a panel for each type it lists, defaulting to the first', () => {
		const logs = PANEL_TEMPLATES.find((t) => t.id === 'logs-list')!;
		expect(logs.types).toEqual(['logs', 'table']);
		expect(logs.panel.type).toBe('logs');
		expect(PANEL_TEMPLATES.find((t) => t.id === 'empty')!.types).toEqual([
			'timeseries',
			'bar',
			'stat',
			'gauge',
			'table',
			'pie',
			'logs',
			'text'
		]);
	});

	it('groups templates by name, the ungrouped ones first and unlabeled', () => {
		const groups = groupTemplates([
			{ id: 'b', group: 'B' },
			{ id: 'x' },
			{ id: 'a', group: 'A' },
			{ id: 'b2', group: 'B' }
		]);
		expect(groups.map((g) => [g.label, g.templates.map((t) => t.id)])).toEqual([
			[undefined, ['x']],
			['A', ['a']],
			['B', ['b', 'b2']]
		]);
	});
});
