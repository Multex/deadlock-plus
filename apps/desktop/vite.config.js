import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { peers } from "@deadlock-plus/ui/peers";
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
    plugins: [tailwindcss(), sveltekit()],

    resolve: { dedupe: peers },

    test: {
        include: [
            "src/**/*.{test,spec}.{js,ts}",
            "../../scripts/**/*.test.mjs",
            "../../packages/deadlock-api/src/**/*.test.ts",
            "../../packages/demo/src/**/*.test.ts",
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
