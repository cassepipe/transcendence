import { sveltekit } from "@sveltejs/kit/vite"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, "..")
	return {
		plugins: [sveltekit()],
		build: {
			minify: false,
		},
		envDir: "../",
		server: {
			// https: {
			// 	key: "../secrets/key.pem",
			// 	cert: "../secrets/cert.pem",
			// },
			proxy: {
				// string shorthand: http://localhost:5173/api -> http://localhost:3000/api
				"/api": env.PUBLIC_BACKEND_URL,
			},
		},
	}
})
