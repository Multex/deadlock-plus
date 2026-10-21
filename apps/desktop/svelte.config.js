// Tauri doesn't have a Node.js server to do proper SSR
// so we use adapter-static with a fallback to index.html to put the site in SPA mode
// See: https://svelte.dev/docs/kit/single-page-apps
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
import { peerPaths } from "@deadlock-plus/ui/peers";
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import process from "node:process";

// Tauri bundles `build`. A demo build (VITE_DEMO in the process environment) must never land there, nor in
// the intermediate output `vite preview` serves, so it gets both directories to itself.
const demo = Boolean(process.env.VITE_DEMO);
// DEMO_ID gives a demo build its own directories, so two can be built in this folder at the same time.
const demoDir = process.env.DEMO_ID ? `demo-${process.env.DEMO_ID}` : "demo";

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    kit: {
        outDir: demo ? `.svelte-kit/${demoDir}` : ".svelte-kit",
        adapter: adapter({
            pages: demo ? `build-${demoDir}` : "build",
            assets: demo ? `build-${demoDir}` : "build",
            fallback: "index.html",
        }),
        typescript: {
            config: (tsconfig) => {
                Object.assign(tsconfig.compilerOptions.paths, peerPaths(import.meta.dirname));
                // Relative to the generated tsconfig. Without these, only package files the app imports are
                // checked, which leaves out every package test.
                const depth = demo ? "../../../.." : "../../..";
                for (const name of ["build-layout", "deadlock-api", "demo", "match", "stats", "ui"]) {
                    tsconfig.include.push(`${depth}/packages/${name}/src/**/*.ts`);
                }
                // The packages' tests sit outside this app, where `vitest` is not installed.
                tsconfig.compilerOptions.paths.vitest = [`${demo ? "../.." : ".."}/node_modules/vitest`];
            },
        },
    },
};

export default config;
