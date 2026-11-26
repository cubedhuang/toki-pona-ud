import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defaultClientConditions, defineConfig } from "vite";

export default defineConfig({
	plugins: [svelte(), tailwindcss()],
	resolve: {
		// Import the parser's TypeScript source so edits reload without a build.
		conditions: ["source", ...defaultClientConditions],
	},
});
