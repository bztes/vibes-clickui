import ChartLineIcon from '@lucide/svelte/icons/chart-line';
import ChartBarIcon from '@lucide/svelte/icons/chart-bar-big';
import GaugeIcon from '@lucide/svelte/icons/gauge';
import HashIcon from '@lucide/svelte/icons/hash';
import TableIcon from '@lucide/svelte/icons/table';
import PieIcon from '@lucide/svelte/icons/chart-pie';
import ScrollTextIcon from '@lucide/svelte/icons/scroll-text';
import TypeIcon from '@lucide/svelte/icons/type';
import type { PanelType } from './types.ts';

export const PANEL_TYPE_ICONS: Record<PanelType, typeof ChartLineIcon> = {
	timeseries: ChartLineIcon,
	bar: ChartBarIcon,
	stat: HashIcon,
	gauge: GaugeIcon,
	table: TableIcon,
	pie: PieIcon,
	logs: ScrollTextIcon,
	text: TypeIcon
};
