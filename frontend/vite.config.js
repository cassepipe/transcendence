import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
export default defineConfig({
    plugins: [
        sveltekit(),
    ],
    build: {
        minify: false,
        reportCompressedSize: false,
    },
    test: {
        include: ['src/**/*.{test,spec}.{js,ts}']
    }
});
//# sourceMappingURL=vite.config.js.map