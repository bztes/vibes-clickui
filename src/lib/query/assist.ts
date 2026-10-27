import { columnKind, unwrapType } from './result.ts';
import { splitArgs, sqlString } from './macros.ts';

export { unwrapType };

export function mapTypes(type: string): { key: string; value: string } | null {
	const m = /^Map\((.*)\)$/.exec(unwrapType(type));
	if (!m) return null;
	const [key, value] = splitArgs(m[1]);
	return value ? { key, value } : null;
}

export function arrayElement(type: string): string | null {
	const m = /^Array\((.*)\)$/.exec(unwrapType(type));
	return m ? m[1] : null;
}

export const isNullable = (type: string) => /^(LowCardinality\()?Nullable\(/.test(type.trim());

export function quoteIdent(name: string) {
	return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `\`${name.replace(/[`\\]/g, '\\$&')}\``;
}

/** a SQL literal for `value` compared against a column of `type` */
export function literal(value: string, type: string) {
	const kind = columnKind(type);
	if (kind === 'number' && /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(value.trim())) return value.trim();
	if (kind === 'bool' && /^(true|false|0|1)$/i.test(value.trim()))
		return value.trim().toLowerCase();
	return sqlString(value);
}

/** `col` or `col['key']` */
export function columnExpr(column: string, mapKey?: { key: string; keyType: string }) {
	const ident = quoteIdent(column);
	return mapKey ? `${ident}[${literal(mapKey.key, mapKey.keyType)}]` : ident;
}
