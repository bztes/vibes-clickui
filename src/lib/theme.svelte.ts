class Theme {
	current = $state<'light' | 'dark'>('dark');

	init() {
		this.current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
	}

	toggle() {
		this.current = this.current === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = this.current;
		try {
			localStorage.setItem('theme', this.current);
		} catch {
			// storage unavailable (private mode) — the toggle still works for this page view
		}
	}
}

export const theme = new Theme();
