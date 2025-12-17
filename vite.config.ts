import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	ssr: {
		// Ensure supabase-js (ESM) is bundled for the server build (Node on Vercel)
		noExternal: ['@supabase/supabase-js']
	},
	test: {
		environment: 'node',
		globals: true,
		setupFiles: ['dotenv/config']
	}
});
