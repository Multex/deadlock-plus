import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { peers } from "@deadlock-plus/ui/peers";
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// Dev servers sharing one dep cache re-optimize each other's dependencies, which holds `tauri dev` back
// at startup. Only `tauri dev` keeps the default directory.
const demoId = process.env.DEMO_ID ? `-${process.env.DEMO_ID}` : "";
const cacheDir = process.env.VITE_DEMO ? `node_modules/.vite-demo${demoId}` : undefined;

// https://vite.dev/config/
export default defineConfig(() => ({
    plugins: [tailwindcss(), sveltekit()],

    cacheDir,

    resolve: { dedupe: peers },

    test: {
        maxWorkers: "50%",
        include: [
            "src/**/*.{test,spec}.{js,ts}",
            "../../scripts/**/*.test.mjs",
            "../../packages/build-layout/src/**/*.test.ts",
            "../../packages/deadlock-api/src/**/*.test.ts",
            "../../packages/demo/src/**/*.test.ts",
            "../../packages/game-ui/src/**/*.test.ts",
            "../../packages/match/src/**/*.test.ts",
            "../../packages/stats/src/**/*.test.ts",
            "../../packages/ui/src/**/*.test.ts",
        ],
    },

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
        port: 1420,
        strictPort: true,
        fs: { allow: ["../.."] },
        // Transforms the startup graph while cargo compiles, so the page is not held for the crawl.
        warmup: {
            clientFiles: [
                "./src/hooks.client.ts",
                "./src/routes/+layout.svelte",
                "./src/routes/(app)/+layout.svelte",
                "./src/routes/(app)/+page.svelte",
            ],
        },
        host: host || "127.0.0.1",
        hmr: host
            ? {
                  protocol: "ws",
                  host,
                  port: 1421,
              }
            : undefined,
        watch: {
            // 3. tell Vite to ignore watching `src-tauri`
            ignored: ["**/src-tauri/**"],
        },
    },
}));
