const UNIT_MS = {
	s: 1000,
	m: 60_000,
	h: 3_600_000,
	d: 86_400_000,
	w: 604_800_000,
	M: 2_592_000_000,
	y: 31_536_000_000
} as const;

const RELATIVE = /^now(?:\s*([+-])\s*(\d+)\s*([smhdwMy]))?(?:\/([smhdwMy]))?$/;

/**
 * Resolves a Grafana style time expression (`now`, `now-6h`, `now-1d/d`, an ISO date
 * or epoch milliseconds) to epoch milliseconds. Returns `null` for unparsable input.
 */
export function parseTime(expr: string, now = Date.now(), roundUp = false): number | null {
	const value = expr.trim();
	const match = RELATIVE.exec(value);
	if (match) {
		const [, sign, amount, unit, round] = match;
		let t = now;
		if (sign) t += (sign === '-' ? -1 : 1) * Number(amount) * UNIT_MS[unit as keyof typeof UNIT_MS];
		if (round) {
			const d = new Date(t);
			if (round === 'd' || round === 'w' || round === 'M' || round === 'y') {
				d.setHours(0, 0, 0, 0);
				if (round === 'w') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
				if (round === 'M' || round === 'y') d.setDate(1);
				if (round === 'y') d.setMonth(0);
				if (roundUp) {
					if (round === 'd') d.setDate(d.getDate() + 1);
					if (round === 'w') d.setDate(d.getDate() + 7);
					if (round === 'M') d.setMonth(d.getMonth() + 1);
					if (round === 'y') d.setFullYear(d.getFullYear() + 1);
					return d.getTime() - 1;
				}
				return d.getTime();
			}
			const size = UNIT_MS[round as keyof typeof UNIT_MS];
			return roundUp ? Math.floor(t / size) * size + size - 1 : Math.floor(t / size) * size;
		}
		return t;
	}
	if (/^\d{10,}$/.test(value)) return Number(value);
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? null : parsed;
}

export function resolveRange(from: string, to: string, now = Date.now()) {
	const f = parseTime(from, now) ?? now - UNIT_MS.h;
	const t = parseTime(to, now, true) ?? now;
	return f < t ? { from: f, to: t } : { from: t, to: f };
}

export const QUICK_RANGES = [
	{ from: 'now-5m', to: 'now', label: 'Last 5 minutes' },
	{ from: 'now-15m', to: 'now', label: 'Last 15 minutes' },
	{ from: 'now-30m', to: 'now', label: 'Last 30 minutes' },
	{ from: 'now-1h', to: 'now', label: 'Last 1 hour' },
	{ from: 'now-3h', to: 'now', label: 'Last 3 hours' },
	{ from: 'now-6h', to: 'now', label: 'Last 6 hours' },
	{ from: 'now-12h', to: 'now', label: 'Last 12 hours' },
	{ from: 'now-24h', to: 'now', label: 'Last 24 hours' },
	{ from: 'now-2d', to: 'now', label: 'Last 2 days' },
	{ from: 'now-7d', to: 'now', label: 'Last 7 days' },
	{ from: 'now/d', to: 'now/d', label: 'Today' },
	{ from: 'now-1d/d', to: 'now-1d/d', label: 'Yesterday' }
];

export function describeRange(from: string, to: string) {
	const quick = QUICK_RANGES.find((r) => r.from === from && r.to === to);
	if (quick) return quick.label;
	const fmt = (expr: string) => {
		if (expr.startsWith('now')) return expr;
		const t = parseTime(expr);
		return t === null ? expr : formatDateTime(t);
	};
	return `${fmt(from)} to ${fmt(to)}`;
}

const NICE_INTERVALS = [
	1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 604800
];

/** Bucket size in seconds so that the range yields at most `maxDataPoints` buckets. */
export function calculateInterval(from: number, to: number, maxDataPoints: number) {
	const raw = (to - from) / 1000 / Math.max(1, maxDataPoints);
	return NICE_INTERVALS.find((i) => i >= raw) ?? NICE_INTERVALS.at(-1)!;
}

/** Parses `10s`, `5m`, `1h` into milliseconds. */
export function parseDuration(value: string) {
	const m = /^(\d+)([smhd])$/.exec(value);
	return m ? Number(m[1]) * UNIT_MS[m[2] as 's' | 'm' | 'h' | 'd'] : 0;
}

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

export function formatDateTime(ms: number, withMillis = false) {
	const d = new Date(ms);
	const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
	return withMillis ? `${base}.${pad(d.getMilliseconds(), 3)}` : base;
}

export function timeAgo(date: Date | number) {
	const diff = (Date.now() - new Date(date).getTime()) / 1000;
	if (diff < 60) return 'just now';
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
	if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
	return `${Math.floor(diff / 86400)}d ago`;
}
