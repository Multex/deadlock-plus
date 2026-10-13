import { peerPaths } from "@deadlock-plus/ui/peers";
import adapter from "@sveltejs/adapter-cloudflare";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    kit: {
        adapter: adapter({ config: "wrangler.kit.toml" }),
        typescript: {
            config: (tsconfig) => {
                Object.assign(tsconfig.compilerOptions.paths, peerPaths(import.meta.dirname));
                // Relative to `.svelte-kit`. Without these, only package files the site imports are checked.
                tsconfig.include.push("../../../packages/links/src/**/*.ts", "../../../packages/analytics/src/**/*.ts");
                // The packages' tests sit outside this app, where `vitest` is not installed.
                tsconfig.compilerOptions.paths.vitest = ["../node_modules/vitest"];
            },
        },
    },
};

export default config;
