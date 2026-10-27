import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

// the dashboard list is the start page
export const load = () => redirect(308, resolve('/'));
