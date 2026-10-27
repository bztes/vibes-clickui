import { goto } from '$app/navigation';
import { page } from '$app/state';

/** Updates query parameters of the current URL without scrolling or losing focus. */
export function setParams(
	updates: Record<string, string | string[] | null | undefined>,
	{ replace = false }: { replace?: boolean } = {}
) {
	const url = new URL(page.url.href);
	for (const [key, value] of Object.entries(updates)) {
		url.searchParams.delete(key);
		if (value === null || value === undefined) continue;
		for (const v of Array.isArray(value) ? value : [value]) url.searchParams.append(key, v);
	}
	if (url.href === page.url.href) return Promise.resolve();
	// same page, only the query string changes
	// eslint-disable-next-line svelte/no-navigation-without-resolve
	return goto(url, { replace, reset: false });
}
