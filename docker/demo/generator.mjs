// Generates realistic-looking traces, logs and metrics for a small fictional shop
// and sends them to an OpenTelemetry collector via OTLP/HTTP (JSON).
// Zero dependencies — run with `node generator.mjs`.
//
//   OTLP_ENDPOINT  collector base URL     (default http://localhost:4318)
//   OTLP_TOKEN     bearer token the collector expects (optional)
//   RATE           requests per second    (default 5)

const ENDPOINT = (process.env.OTLP_ENDPOINT ?? 'http://localhost:4318').replace(/\/$/, '');
const RATE = Number(process.env.RATE ?? 5);
const TOKEN = process.env.OTLP_TOKEN;

const SERVER = 2;
const CLIENT = 3;

const hex = (bytes) =>
	Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
		b.toString(16).padStart(2, '0')
	).join('');
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
/** log-normal-ish latency in ms around `median` */
const latency = (median, spread = 0.5) => median * Math.exp(spread * gaussian());
function gaussian() {
	const u = 1 - Math.random();
	const v = Math.random();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const attrs = (obj) =>
	Object.entries(obj).map(([key, value]) => ({
		key,
		value:
			typeof value === 'number'
				? Number.isInteger(value)
					? { intValue: String(value) }
					: { doubleValue: value }
				: typeof value === 'boolean'
					? { boolValue: value }
					: { stringValue: String(value) }
	}));
const ns = (ms) => String(BigInt(Math.round(ms * 1e6)));

const services = {
	frontend: { version: '2.4.1', lang: 'nodejs' },
	cart: { version: '1.9.0', lang: 'go' },
	checkout: { version: '3.1.2', lang: 'java' },
	payment: { version: '1.2.7', lang: 'python' },
	inventory: { version: '0.8.3', lang: 'rust' }
};

const resource = (service) => ({
	attributes: attrs({
		'service.name': service,
		'service.version': services[service].version,
		'deployment.environment.name': 'demo',
		'telemetry.sdk.language': services[service].lang,
		'host.name': `${service}-${service.length % 3}`
	})
});

/** @type {Map<string, any[]>} */ let spans = new Map();
/** @type {Map<string, any[]>} */ let logs = new Map();
const counters = new Map();
const orders = { placed: 0, failed: 0, revenue: 0 };
const histograms = new Map();
const BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500];

function span(
	service,
	{ traceId, spanId = hex(8), parentId = '', name, kind, start, duration, attributes = {}, error }
) {
	const s = {
		traceId,
		spanId,
		parentSpanId: parentId,
		name,
		kind,
		startTimeUnixNano: ns(start),
		endTimeUnixNano: ns(start + duration),
		attributes: attrs(attributes),
		status: error ? { code: 2, message: error } : { code: 1 },
		events: error
			? [
					{
						timeUnixNano: ns(start + duration * 0.9),
						name: 'exception',
						attributes: attrs({
							'exception.type': 'PaymentDeclinedError',
							'exception.message': error
						})
					}
				]
			: []
	};
	if (!spans.has(service)) spans.set(service, []);
	spans.get(service).push(s);
	return spanId;
}

function log(service, { time, severity, body, traceId, spanId, attributes = {} }) {
	const numbers = { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 };
	if (!logs.has(service)) logs.set(service, []);
	logs.get(service).push({
		timeUnixNano: ns(time),
		observedTimeUnixNano: ns(time),
		severityNumber: numbers[severity],
		severityText: severity,
		body: { stringValue: body },
		traceId,
		spanId,
		attributes: attrs(attributes)
	});
}

function record(service, route, status, durationMs) {
	const key = `${service}|${route}|${status}`;
	counters.set(key, (counters.get(key) ?? 0) + 1);
	const hkey = `${service}|${route}`;
	const h = histograms.get(hkey) ?? {
		count: 0,
		sum: 0,
		min: Infinity,
		max: 0,
		buckets: new Array(BUCKETS.length + 1).fill(0)
	};
	h.count++;
	h.sum += durationMs;
	h.min = Math.min(h.min, durationMs);
	h.max = Math.max(h.max, durationMs);
	const bucket = BUCKETS.findIndex((b) => durationMs <= b);
	h.buckets[bucket === -1 ? BUCKETS.length : bucket]++;
	histograms.set(hkey, h);
}

// slow periods make the dashboards more interesting
const degraded = () => Math.sin(Date.now() / 120_000) > 0.85;

function dbSpan(service, traceId, parentId, start, table, op = 'SELECT') {
	const duration = latency(degraded() ? 40 : 4, 0.6);
	span(service, {
		traceId,
		parentId,
		name: `${op} shop.${table}`,
		kind: CLIENT,
		start,
		duration,
		attributes: {
			'db.system.name': 'postgresql',
			'db.namespace': 'shop',
			'db.operation.name': op,
			'db.collection.name': table,
			'db.query.text': `${op} * FROM ${table} WHERE id = $1`,
			'server.address': 'postgres'
		}
	});
	return duration;
}

function rpc(from, to, traceId, parentId, start, route, handler) {
	const clientId = hex(8);
	const serverId = hex(8);
	let t = start + latency(1, 0.3);
	const serverStart = t;
	const { duration: inner, error } = handler(span.bind(null, to), serverStart, serverId);
	const serverDuration = inner + latency(0.5, 0.3);
	span(to, {
		traceId,
		spanId: serverId,
		parentId: clientId,
		name: `POST ${route}`,
		kind: SERVER,
		start: serverStart,
		duration: serverDuration,
		attributes: {
			'http.request.method': 'POST',
			'http.route': route,
			'http.response.status_code': error ? 500 : 200,
			'url.path': route
		},
		error
	});
	record(to, route, error ? 500 : 200, serverDuration);
	const total = serverDuration + latency(1, 0.3) + (serverStart - start);
	// emit the client span with the precomputed id
	(spans.get(from) ?? spans.set(from, []).get(from)).push({
		traceId,
		spanId: clientId,
		parentSpanId: parentId,
		name: `POST ${route}`,
		kind: CLIENT,
		startTimeUnixNano: ns(start),
		endTimeUnixNano: ns(start + total),
		attributes: attrs({
			'http.request.method': 'POST',
			'server.address': to,
			'http.response.status_code': error ? 500 : 200
		}),
		status: error ? { code: 2, message: error } : { code: 0 },
		events: []
	});
	return { duration: total, error };
}

const routes = [
	{ route: '/', weight: 5 },
	{ route: '/product/{id}', weight: 6 },
	{ route: '/cart', weight: 3 },
	{ route: '/checkout', weight: 1.5 }
];
const totalWeight = routes.reduce((s, r) => s + r.weight, 0);
function pickRoute() {
	let x = Math.random() * totalWeight;
	for (const r of routes) if ((x -= r.weight) <= 0) return r.route;
	return '/';
}

function request() {
	const traceId = hex(16);
	const start = Date.now() - Math.random() * 1000;
	const route = pickRoute();
	const rootId = hex(8);
	let t = start + latency(0.5, 0.2);
	let error;
	const userId = `user-${Math.floor(Math.random() * 500)}`;

	if (route === '/' || route === '/product/{id}') {
		const r = rpc(
			'frontend',
			'inventory',
			traceId,
			rootId,
			t,
			'/inventory.v1/GetProducts',
			(emit, s, parent) => {
				let d = dbSpan('inventory', traceId, parent, s + 0.2, 'products');
				if (route === '/product/{id}')
					d += dbSpan('inventory', traceId, parent, s + d + 0.4, 'reviews');
				return { duration: d + 0.8 };
			}
		);
		t += r.duration;
	} else if (route === '/cart') {
		const r = rpc('frontend', 'cart', traceId, rootId, t, '/cart.v1/GetCart', (emit, s, parent) => {
			const d = latency(degraded() ? 30 : 2, 0.5);
			emit({
				traceId,
				parentId: parent,
				name: 'redis GET',
				kind: CLIENT,
				start: s + 0.1,
				duration: d,
				attributes: { 'db.system.name': 'redis', 'db.operation.name': 'GET' }
			});
			return { duration: d + 0.3 };
		});
		t += r.duration;
	} else {
		const r = rpc(
			'frontend',
			'checkout',
			traceId,
			rootId,
			t,
			'/checkout.v1/PlaceOrder',
			(emit, s, parent) => {
				let d = 0.5;
				const c = rpc(
					'checkout',
					'cart',
					traceId,
					parent,
					s + d,
					'/cart.v1/GetCart',
					(emit2, s2, p2) => {
						const dd = latency(2, 0.5);
						emit2({
							traceId,
							parentId: p2,
							name: 'redis GET',
							kind: CLIENT,
							start: s2 + 0.1,
							duration: dd,
							attributes: { 'db.system.name': 'redis', 'db.operation.name': 'GET' }
						});
						return { duration: dd + 0.2 };
					}
				);
				d += c.duration;
				const amount = Math.round(Math.random() * 30000) / 100;
				const p = rpc(
					'checkout',
					'payment',
					traceId,
					parent,
					s + d,
					'/payment.v1/Charge',
					(emit2, s2, p2) => {
						const dd = latency(degraded() ? 400 : 80, 0.4);
						const failed = Math.random() < (degraded() ? 0.15 : 0.03);
						emit2({
							traceId,
							parentId: p2,
							name: 'stripe.charges.create',
							kind: CLIENT,
							start: s2 + 1,
							duration: dd,
							attributes: { 'server.address': 'api.stripe.com', 'payment.amount': amount },
							error: failed ? 'card_declined' : undefined
						});
						log('payment', {
							time: s2 + dd,
							severity: failed ? 'ERROR' : 'INFO',
							body: failed
								? `Charge of $${amount} for ${userId} declined: card_declined`
								: `Charged $${amount} for ${userId}`,
							traceId,
							spanId: p2,
							attributes: { 'user.id': userId, 'payment.amount': amount }
						});
						return { duration: dd + 2, error: failed ? 'card_declined' : undefined };
					}
				);
				d += p.duration;
				if (p.error) {
					orders.failed++;
					log('checkout', {
						time: s + d,
						severity: 'WARN',
						body: `Order for ${userId} failed: payment declined`,
						traceId,
						spanId: parent,
						attributes: { 'user.id': userId }
					});
					return { duration: d, error: 'payment failed' };
				}
				d += dbSpan('checkout', traceId, parent, s + d + 0.2, 'orders', 'INSERT');
				orders.placed++;
				orders.revenue += amount;
				log('checkout', {
					time: s + d,
					severity: 'INFO',
					body: `Order placed for ${userId}`,
					traceId,
					spanId: parent,
					attributes: { 'user.id': userId, 'order.total': amount }
				});
				return { duration: d + 0.5 };
			}
		);
		t += r.duration;
		error = r.error;
	}

	const duration = t - start + latency(1, 0.3);
	const status = error ? 500 : 200;
	span('frontend', {
		traceId,
		spanId: rootId,
		name: `GET ${route}`,
		kind: SERVER,
		start,
		duration,
		attributes: {
			'http.request.method': 'GET',
			'http.route': route,
			'http.response.status_code': status,
			'url.path': route.replace('{id}', String(Math.floor(Math.random() * 100))),
			'user_agent.original': pick([
				'Mozilla/5.0 (Macintosh)',
				'Mozilla/5.0 (Windows NT 10.0)',
				'Mozilla/5.0 (iPhone)'
			])
		},
		error: error ? 'Internal Server Error' : undefined
	});
	record('frontend', route, status, duration);
	if (duration > 500)
		log('frontend', {
			time: start + duration,
			severity: 'WARN',
			body: `Slow request ${route} took ${duration.toFixed(0)}ms`,
			traceId,
			spanId: rootId,
			attributes: { 'http.route': route }
		});
	if (Math.random() < 0.05)
		log('frontend', {
			time: start,
			severity: 'DEBUG',
			body: `cache miss for ${route}`,
			traceId,
			spanId: rootId
		});
}

const startTime = Date.now();

function metricsPayload() {
	const now = Date.now();
	const byService = new Map();
	const push = (service, metric) => {
		if (!byService.has(service)) byService.set(service, []);
		byService.get(service).push(metric);
	};
	for (const [key, value] of counters) {
		const [service, route, status] = key.split('|');
		push(service, {
			name: 'http.server.requests',
			description: 'Number of HTTP requests handled',
			unit: '{request}',
			sum: {
				aggregationTemporality: 2,
				isMonotonic: true,
				dataPoints: [
					{
						startTimeUnixNano: ns(startTime),
						timeUnixNano: ns(now),
						asInt: String(value),
						attributes: attrs({ 'http.route': route, 'http.response.status_code': Number(status) })
					}
				]
			}
		});
	}
	for (const [key, h] of histograms) {
		const [service, route] = key.split('|');
		push(service, {
			name: 'http.server.request.duration',
			description: 'Duration of HTTP server requests',
			unit: 'ms',
			histogram: {
				aggregationTemporality: 2,
				dataPoints: [
					{
						startTimeUnixNano: ns(startTime),
						timeUnixNano: ns(now),
						count: String(h.count),
						sum: h.sum,
						min: h.min,
						max: h.max,
						bucketCounts: h.buckets.map(String),
						explicitBounds: BUCKETS,
						attributes: attrs({ 'http.route': route })
					}
				]
			}
		});
	}
	for (const service of Object.keys(services)) {
		push(service, {
			name: 'process.memory.usage',
			description: 'Resident memory of the process',
			unit: 'By',
			gauge: {
				dataPoints: [
					{
						timeUnixNano: ns(now),
						asInt: String(
							Math.round(
								(150 + service.length * 40 + 30 * Math.sin(now / 60000 + service.length)) *
									1024 *
									1024
							)
						)
					}
				]
			}
		});
		push(service, {
			name: 'process.cpu.utilization',
			description: 'CPU utilization of the process',
			unit: '1',
			gauge: {
				dataPoints: [
					{
						timeUnixNano: ns(now),
						asDouble: Math.min(1, Math.max(0, 0.15 + (degraded() ? 0.5 : 0) + 0.08 * gaussian()))
					}
				]
			}
		});
	}
	push('checkout', {
		name: 'shop.orders',
		description: 'Orders by outcome',
		unit: '{order}',
		sum: {
			aggregationTemporality: 2,
			isMonotonic: true,
			dataPoints: ['placed', 'failed'].map((outcome) => ({
				startTimeUnixNano: ns(startTime),
				timeUnixNano: ns(now),
				asInt: String(orders[outcome]),
				attributes: attrs({ 'order.outcome': outcome })
			}))
		}
	});
	push('checkout', {
		name: 'shop.revenue',
		description: 'Revenue of placed orders',
		unit: 'USD',
		sum: {
			aggregationTemporality: 2,
			isMonotonic: true,
			dataPoints: [
				{ startTimeUnixNano: ns(startTime), timeUnixNano: ns(now), asDouble: orders.revenue }
			]
		}
	});
	for (const service of ['checkout', 'inventory']) {
		const used = Math.max(0, Math.min(20, Math.round((degraded() ? 16 : 4) + 2 * gaussian())));
		push(service, {
			name: 'db.client.connection.count',
			description: 'Connections in the database pool',
			unit: '{connection}',
			sum: {
				aggregationTemporality: 2,
				isMonotonic: false,
				dataPoints: [
					{
						timeUnixNano: ns(now),
						asInt: String(used),
						attributes: attrs({
							'db.client.connection.state': 'used',
							'db.client.connection.pool.name': 'shop'
						})
					},
					{
						timeUnixNano: ns(now),
						asInt: String(20 - used),
						attributes: attrs({
							'db.client.connection.state': 'idle',
							'db.client.connection.pool.name': 'shop'
						})
					}
				]
			}
		});
	}
	return {
		resourceMetrics: [...byService].map(([service, metrics]) => ({
			resource: resource(service),
			scopeMetrics: [{ scope: { name: 'demo-generator' }, metrics }]
		}))
	};
}

async function send(path, body) {
	try {
		const res = await fetch(`${ENDPOINT}${path}`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(TOKEN && { authorization: `Bearer ${TOKEN}` })
			},
			body: JSON.stringify(body)
		});
		if (!res.ok) console.error(`${path}: ${res.status} ${await res.text()}`);
	} catch (e) {
		console.error(`${path}: ${e.cause?.code ?? e.message}`);
	}
}

async function flush() {
	const s = spans;
	const l = logs;
	spans = new Map();
	logs = new Map();
	await Promise.all([
		send('/v1/traces', {
			resourceSpans: [...s].map(([service, list]) => ({
				resource: resource(service),
				scopeSpans: [{ scope: { name: 'demo-generator' }, spans: list }]
			}))
		}),
		l.size &&
			send('/v1/logs', {
				resourceLogs: [...l].map(([service, list]) => ({
					resource: resource(service),
					scopeLogs: [{ scope: { name: 'demo-generator' }, logRecords: list }]
				}))
			})
	]);
}

console.log(`sending ~${RATE} req/s of demo telemetry to ${ENDPOINT}`);
setInterval(() => {
	const n = Math.max(0, Math.round(RATE * (0.7 + Math.random() * 0.6)));
	for (let i = 0; i < n; i++) request();
	void flush();
}, 1000);
setInterval(() => void send('/v1/metrics', metricsPayload()), 10_000);
