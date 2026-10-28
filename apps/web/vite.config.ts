import { peers } from "@deadlock-plus/ui/peers";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [tailwindcss(), sveltekit()],
    resolve: { dedupe: peers },
    // SvelteKit limits the dev server to this app's folders; the shared fonts, theme and catalogs live outside them.
    server: { fs: { allow: ["../../packages", "../../locales"] } },
    test: {
        include: [
            "src/**/*.test.ts",
            "../../packages/links/src/**/*.test.ts",
            "../../packages/analytics/src/**/*.test.ts",
            "../../packages/costs/src/**/*.test.ts",
        ],
    },
});
