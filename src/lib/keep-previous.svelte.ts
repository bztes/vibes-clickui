/** The latest defined value of `get`, so a reloading query keeps showing its previous result. */
export function keepPrevious<T>(get: () => T | undefined) {
	let previous: T | undefined;
	const current = $derived.by(() => {
		const value = get();
		if (value !== undefined) previous = value;
		return value ?? previous;
	});
	return {
		get current() {
			return current;
		},
		/** forgets the held value, e.g. when the next query is about something else */
		reset() {
			previous = undefined;
		}
	};
}
