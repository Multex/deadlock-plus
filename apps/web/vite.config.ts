import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { peers } from "@deadlock-plus/ui/peers";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const ENGLISH = fileURLToPath(new URL("../../locales/web/en.json", import.meta.url));
const NAMESPACE = "virtual:en/";

// Crowdin wants one English file, but a page should carry only its own copy: `virtual:en/faq` is the `faq`
// namespace on its own, so the bundler can put each namespace in the chunk of the pages that use it.
function englishNamespaces(): Plugin {
    return {
        name: "english-namespaces",
        resolveId: (id) => (id.startsWith(NAMESPACE) ? `\0${id}` : undefined),
        load(id) {
            if (!id.startsWith(`\0${NAMESPACE}`)) return;
            this.addWatchFile(ENGLISH);
            const namespace = id.slice(NAMESPACE.length + 1);
            const catalog = JSON.parse(readFileSync(ENGLISH, "utf8"));
            if (!(namespace in catalog)) this.error(`locales/web/en.json has no ${namespace} namespace`);
            return `export default ${JSON.stringify({ [namespace]: catalog[namespace] })};`;
        },
    };
}

export default defineConfig({
    plugins: [englishNamespaces(), tailwindcss(), sveltekit()],
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
