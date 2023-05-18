import adapter from "@sveltejs/adapter-static"
import { vitePreprocess } from "@sveltejs/kit/vite"
import { reactivePreprocess } from "svelte-reactive-preprocessor"

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	// preprocess: [vitePreprocess(), reactivePreprocess()],
	preprocess: [vitePreprocess()],

	kit: {
		adapter: adapter({
			fallback: "index.html",
		}),
		alias: {
			$contracts: "../contract",
			$types: "lib/types",
			$stores: "lib/stores",
		},
	},
}

export default config
