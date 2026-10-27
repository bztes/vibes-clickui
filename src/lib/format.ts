import type { ColorName, SeriesColorName, Threshold, Unit } from '#lib/dashboard/types.ts';

function trim(n: number, decimals: number | null | undefined, fallback = 2) {
	const d = decimals ?? (Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : fallback);
	return n.toLocaleString('en-US', {
		maximumFractionDigits: d,
		minimumFractionDigits: decimals ?? 0
	});
}

function scaled(n: number, base: number, suffixes: string[], decimals?: number | null) {
	let i = 0;
	let v = n;
	while (Math.abs(v) >= base && i < suffixes.length - 1) {
		v /= base;
		i++;
	}
	return `${trim(v, decimals)}${suffixes[i]}`;
}

function duration(ns: number, decimals?: number | null) {
	const abs = Math.abs(ns);
	if (abs === 0) return '0';
	if (abs < 1e3) return `${trim(ns, decimals)} ns`;
	if (abs < 1e6) return `${trim(ns / 1e3, decimals)} µs`;
	if (abs < 1e9) return `${trim(ns / 1e6, decimals)} ms`;
	if (abs < 60e9) return `${trim(ns / 1e9, decimals)} s`;
	if (abs < 3600e9) return `${trim(ns / 60e9, decimals)} min`;
	if (abs < 86400e9) return `${trim(ns / 3600e9, decimals)} h`;
	return `${trim(ns / 86400e9, decimals)} d`;
}

export function formatValue(value: unknown, unit: Unit = 'none', decimals?: number | null): string {
	if (value === null || value === undefined) return '–';
	if (typeof value !== 'number') {
		const n = Number(value);
		if (typeof value !== 'string' || value === '' || !Number.isFinite(n)) return String(value);
		value = n;
	}
	const n = value as number;
	if (!Number.isFinite(n)) return String(n);
	switch (unit) {
		case 'short':
			return scaled(n, 1000, ['', 'k', 'M', 'B', 'T'], decimals);
		case 'percent':
			return `${trim(n, decimals, 1)}%`;
		case 'percentunit':
			return `${trim(n * 100, decimals, 1)}%`;
		case 'bytes':
			return scaled(n, 1024, [' B', ' KiB', ' MiB', ' GiB', ' TiB', ' PiB'], decimals);
		case 'decbytes':
			return scaled(n, 1000, [' B', ' kB', ' MB', ' GB', ' TB', ' PB'], decimals);
		case 'ns':
			return duration(n, decimals);
		case 'us':
			return duration(n * 1e3, decimals);
		case 'ms':
			return duration(n * 1e6, decimals);
		case 's':
			return duration(n * 1e9, decimals);
		case 'reqps':
			return `${scaled(n, 1000, ['', 'k', 'M'], decimals)} req/s`;
		case 'ops':
			return `${scaled(n, 1000, ['', 'k', 'M'], decimals)} ops/s`;
		default:
			return decimals != null ? n.toFixed(decimals) : trim(n, null);
	}
}

export function thresholdColor(value: number | null, thresholds: Threshold[]): ColorName {
	let color: ColorName = thresholds.find((t) => t.value === null)?.color ?? 'blue';
	if (value === null) return color;
	const steps = thresholds
		.filter((t): t is Threshold & { value: number } => t.value !== null)
		.sort((a, b) => a.value - b.value);
	for (const step of steps) if (value >= step.value) color = step.color;
	return color;
}

const COLOR_TOKENS: Record<ColorName, string> = {
	good: '--good',
	warning: '--warning',
	serious: '--serious',
	critical: '--critical',
	blue: '--series-1',
	violet: '--series-7',
	muted: '--muted'
};

/** CSS color for a named threshold/status color (raw tokens; `@theme inline` emits no --color-* vars) */
export const colorVar = (name: ColorName) => `var(${COLOR_TOKENS[name]})`;

/** Categorical series colors, assigned in fixed order. */
export const SERIES_VARS = Array.from({ length: 8 }, (_, i) => `--series-${i + 1}`);

export const SERIES_COLOR_VARS: Record<SeriesColorName, string> = {
	blue: '--series-1',
	orange: '--series-2',
	teal: '--series-3',
	yellow: '--series-4',
	pink: '--series-5',
	green: '--series-6',
	violet: '--series-7',
	red: '--series-8',
	gray: '--muted'
};

/** FNV-1a: a key's preferred palette slot, the same on every render and in every panel */
function paletteSlot(key: string) {
	let hash = 0x811c9dc5;
	for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193);
	return (hash >>> 0) % SERIES_VARS.length;
}

/**
 * CSS variable per color key: pinned keys (key → CSS variable) keep their color, the rest
 * get the color their key hashes to, so it doesn't depend on row order or on which other
 * keys are shown. When that color is already used in this chart, the next free one is taken
 * (keys resolved in sorted order, so only the set of keys matters). Equal keys share a color.
 */
export function assignSeriesColors(keys: string[], pinned: Record<string, string> = {}) {
	const pinnedVar = (key: string) => (Object.hasOwn(pinned, key) ? pinned[key] : undefined);
	const used = new Set(keys.map(pinnedVar).filter(Boolean));
	const auto = new Map<string, string>();
	const unpinned = [...new Set(keys.filter((key) => !pinnedVar(key)))].sort();
	for (const key of unpinned) {
		const slot = paletteSlot(key);
		let color = SERIES_VARS[slot];
		for (let i = 0; i < SERIES_VARS.length && used.has(color); i++) {
			color = SERIES_VARS[(slot + i + 1) % SERIES_VARS.length];
		}
		// more keys than colors: fall back to the preferred one
		if (used.has(color)) color = SERIES_VARS[slot];
		used.add(color);
		auto.set(key, color);
	}
	return keys.map((key) => pinnedVar(key) || auto.get(key)!);
}

export function severityColor(severity: string): ColorName {
	const s = severity.toUpperCase();
	if (s.startsWith('FATAL') || s.startsWith('ERROR') || s.startsWith('CRIT')) return 'critical';
	if (s.startsWith('WARN')) return 'warning';
	if (s.startsWith('INFO')) return 'blue';
	return 'muted';
}
