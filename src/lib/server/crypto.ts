import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { BETTER_AUTH_SECRET } from '$app/env/private';

let derived: Buffer | undefined;
const key = () =>
	(derived ??= createHash('sha256')
		.update(`vibes-clickui:datasource:${BETTER_AUTH_SECRET}`)
		.digest());

/** Encrypts a secret as `iv.tag.ciphertext` (base64url). */
export function encrypt(plain: string) {
	if (!plain) return '';
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key(), iv);
	const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

/** Like `decrypt`, but returns `null` when the value was encrypted with another secret. */
export function tryDecrypt(value: string) {
	try {
		return decrypt(value);
	} catch {
		return null;
	}
}

export function decrypt(value: string) {
	if (!value) return '';
	const [iv, tag, data] = value.split('.').map((p) => Buffer.from(p, 'base64url'));
	const decipher = createDecipheriv('aes-256-gcm', key(), iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
