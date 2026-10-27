import { defineEnvVars } from '@sveltejs/kit/env';
import { building } from '$app/env';

/** required when the app starts, optional while building (e.g. in Docker) */
const required = (name: string) => (value: string | undefined) => {
	if (!value && !building) throw new Error(`${name} must be set`);
	return value ?? '';
};

export const variables = defineEnvVars({
	DATA_DIR: {
		description: 'Folder holding the SQLite database (`vibes-clickui.db`). Defaults to `./data`.',
		schema: (value: string | undefined) => value || './data'
	},
	ORIGIN: {
		description: 'The app origin (base URL), e.g. `http://localhost:5173`.',
		schema: required('ORIGIN')
	},
	BETTER_AUTH_SECRET: {
		description:
			'Secret used to sign tokens and encrypt data source passwords. For production use 32 characters generated with high entropy. See [Better Auth installation](https://www.better-auth.com/docs/installation).',
		schema: required('BETTER_AUTH_SECRET')
	}
});
