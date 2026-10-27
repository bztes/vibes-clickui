import { describe, expect, it } from 'vitest';
import { parseStoredModel } from './types.ts';

describe('parseStoredModel', () => {
	const gridPos = { x: 0, y: 0, w: 6, h: 4 };

	it('turns panels of a removed type into a text panel that can be deleted', () => {
		const model = parseStoredModel({
			panels: [
				{ id: 'a', type: 'stat', title: 'Queries', gridPos },
				{ id: 'b', type: 'dashboards', title: 'Dashboards', gridPos, options: { reduce: 'max' } }
			]
		});
		expect(model.panels.map((p) => p.type)).toEqual(['stat', 'text']);
		expect(model.panels[1]).toMatchObject({ id: 'b', title: 'Dashboards', gridPos });
		expect(model.panels[1].options.content).toContain('`dashboards`');
	});

	it('still rejects otherwise invalid models', () => {
		expect(() => parseStoredModel({ panels: [{ id: 'a', type: 'stat' }] })).toThrow();
	});
});
