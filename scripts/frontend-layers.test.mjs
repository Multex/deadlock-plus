import { describe, expect, it } from "vitest";
import {
    checkLayers,
    checkPackageLayers,
    checkUiPackageLayers,
    extractImports,
    plainPackages,
} from "./frontend-layers.mjs";

const f = (file, ...imports) => ({ file, imports });

describe("frontend layers", () => {
    it("accepts a clean tree", () => {
        const files = [
            f("lib/core/ipc.ts", "@tauri-apps/api/core"),
            f("lib/features/demos/api.ts", "@tauri-apps/api/core", "$lib/core/ipc"),
            f("lib/features/demos/demos.ts", "./api"),
            f(
                "lib/components/confirm-dialog.svelte",
                "@deadlock-plus/ui/confirm-dialog.svelte",
                "$lib/core/i18n.svelte",
            ),
            f("lib/shell/sidebar.svelte", "$lib/features/registry"),
        ];
        expect(checkLayers(files, [])).toEqual([]);
    });

    it("rejects tauri outside core and feature api files", () => {
        const files = [
            f("lib/features/demos/demos.ts", "@tauri-apps/api/core"),
            f("routes/+page.svelte", "@tauri-apps/plugin-log"),
        ];
        expect(checkLayers(files, [])).toEqual([
            expect.stringContaining("lib/features/demos/demos.ts imports @tauri-apps/api/core"),
            expect.stringContaining("routes/+page.svelte imports @tauri-apps/plugin-log"),
        ]);
    });

    it("exempts test files from the tauri rule", () => {
        expect(checkLayers([f("lib/features/demos/demos.test.ts", "@tauri-apps/api/core")], [])).toEqual([]);
    });

    it("rejects core importing features, absolute or relative", () => {
        const files = [
            f("lib/core/a.ts", "$lib/features/demos/demos"),
            f("lib/core/b.svelte.ts", "../features/demos/demos"),
        ];
        expect(checkLayers(files, [])).toEqual([
            expect.stringContaining("lib/core/a.ts imports $lib/features/demos/demos: lib/core must not import"),
            expect.stringContaining("lib/core/b.svelte.ts imports ../features/demos/demos"),
        ]);
    });

    it("lets shell import features only through the registry", () => {
        const files = [
            f("lib/shell/a.svelte", "$lib/features/registry"),
            f("lib/shell/b.svelte", "$lib/features/home/home"),
        ];
        expect(checkLayers(files, [])).toEqual([
            expect.stringContaining("lib/shell/b.svelte imports $lib/features/home/home"),
        ]);
    });

    it("suppresses violations listed in the allow-list", () => {
        const files = [f("lib/features/demos/demos.ts", "@tauri-apps/api/core")];
        expect(checkLayers(files, [["lib/features/demos/demos.ts", "tauri"]])).toEqual([]);
    });

    it("keeps an allow-list entry scoped to its rule", () => {
        const files = [f("lib/core/a.ts", "$lib/features/x/y")];
        expect(checkLayers(files, [["lib/core/a.ts", "tauri"]])).toEqual([
            expect.stringContaining("lib/core/a.ts imports $lib/features/x/y"),
            expect.stringContaining("stale allow-list entry lib/core/a.ts (tauri)"),
        ]);
    });

    it("rejects a stale allow-list entry", () => {
        const files = [f("lib/features/demos/api.ts", "@tauri-apps/api/core")];
        expect(checkLayers(files, [["lib/features/demos/api.ts", "tauri"]])).toEqual([
            expect.stringContaining("stale allow-list entry lib/features/demos/api.ts (tauri)"),
        ]);
    });

    it("extracts static, side-effect, re-export and dynamic imports", () => {
        const src = `
            import a from "./a";
            import type { B } from '$lib/b';
            import "./side";
            export { c } from "./c";
            const d = await import("./d");
            const s = "not from an import";
        `;
        expect(extractImports(src)).toEqual(["./a", "$lib/b", "./side", "./c", "./d"]);
    });
});

describe("demo package layers", () => {
    it("accepts the package's own files, the IPC types and other plain packages", () => {
        const files = [
            f("packages/demo/src/index.ts", "./scenario", "./scenarios"),
            f("packages/demo/src/scenarios/default/shell.ts", "@deadlock-plus/ipc-types/AppInfo", "../../backend"),
            f("packages/demo/src/scenario.test.ts", "vitest", "svelte-sonner"),
        ];
        expect(checkPackageLayers(files)).toEqual([]);
    });

    it("rejects the frontend framework, Tauri and the app's aliases", () => {
        const specifiers = [
            "svelte",
            "svelte/store",
            "@sveltejs/kit",
            "@tauri-apps/api/mocks",
            "$lib/features/stats/rank",
            "$app/environment",
        ];
        const violations = checkPackageLayers([f("packages/demo/src/scenario.ts", ...specifiers)]);
        expect(violations).toEqual(
            specifiers.map((specifier) =>
                expect.stringContaining(`packages/demo/src/scenario.ts imports ${specifier}:`),
            ),
        );
    });

    it("rejects a relative path into an app, in test files too", () => {
        const files = [
            f("packages/demo/src/scenarios/default/shell.ts", "../../../../../apps/desktop/package.json"),
            f("packages/demo/src/a.test.ts", "../../../apps/desktop/src/lib/core/kv"),
            f("packages/demo/src/b.ts", "../../../CHANGELOG.md?raw"),
        ];
        expect(checkPackageLayers(files)).toEqual([
            expect.stringContaining("shell.ts imports ../../../../../apps/desktop/package.json"),
            expect.stringContaining("a.test.ts imports ../../../apps/desktop/src/lib/core/kv"),
        ]);
    });
});

describe("plain package layers", () => {
    it("covers every package folder except the Svelte one and the generated one", () => {
        expect(plainPackages(["analytics", "demo", "ipc-types", "links", "match", "ui"])).toEqual([
            "analytics",
            "demo",
            "links",
            "match",
        ]);
    });

    it("accepts a package's own files and the plain packages it builds on", () => {
        const files = [
            f("packages/match/src/list.ts", "@deadlock-plus/stats/stats", "@deadlock-plus/ipc-types/ProvisionalMatch"),
            f("packages/match/src/deep-dive/chart.ts", "../detail"),
            f("packages/match/src/api-detail.test.ts", "vitest", "./fixtures/api-ranked.json"),
            f("packages/discord-messages/test/index.test.js", "node:test", "../src/index.js"),
        ];
        expect(checkPackageLayers(files)).toEqual([]);
    });

    it("rejects Svelte, the Svelte component package, Tauri and the app's aliases", () => {
        const specifiers = [
            "svelte",
            "@deadlock-plus/ui/select-menu",
            "@tauri-apps/api/core",
            "$lib/core/i18n.svelte",
            "$lib/core/kv",
            "$lib/locales/en.json",
        ];
        const violations = checkPackageLayers([f("packages/stats/src/sessions.ts", ...specifiers)]);
        expect(violations).toEqual(
            specifiers.map((specifier) =>
                expect.stringContaining(`packages/stats/src/sessions.ts imports ${specifier}:`),
            ),
        );
    });

    it("rejects a relative path into an app", () => {
        const files = [f("packages/links/src/urls.ts", "../../../apps/web/src/lib/content/links")];
        expect(checkPackageLayers(files)).toEqual([
            expect.stringContaining("urls.ts imports ../../../apps/web/src/lib/content/links"),
        ]);
    });
});

describe("ui package layers", () => {
    it("accepts Svelte, the component libraries and the package's own files", () => {
        const files = [
            f("packages/ui/src/dialog/content.svelte", "bits-ui", "svelte", "../utils", "../overlay-host"),
            f("packages/ui/src/button.svelte", "svelte/elements", "tailwind-variants", "./utils"),
            f("packages/ui/src/brand-mark.svelte", "./brand-mark.png"),
            f("packages/ui/src/slider.test.ts", "vitest", "./slider"),
        ];
        expect(checkUiPackageLayers(files)).toEqual([]);
    });

    it("rejects the app's aliases, Tauri and SvelteKit, so the translation catalog stays out of reach", () => {
        const specifiers = [
            "$lib/core/i18n.svelte",
            "$lib/locales/en.json",
            "$lib/shell/overlay-host.svelte",
            "@tauri-apps/api/window",
            "$app/state",
            "@sveltejs/kit",
        ];
        const violations = checkUiPackageLayers([f("packages/ui/src/confirm-dialog.svelte", ...specifiers)]);
        expect(violations).toEqual(
            specifiers.map((specifier) =>
                expect.stringContaining(`packages/ui/src/confirm-dialog.svelte imports ${specifier}:`),
            ),
        );
    });

    it("rejects a relative path into an app, in test files too", () => {
        const files = [
            f("packages/ui/src/confirm-dialog.svelte", "../../../apps/desktop/src/lib/locales/en.json"),
            f("packages/ui/src/a.test.ts", "../../../apps/web/src/lib/content/links"),
            f("packages/ui/src/peers.test.ts", "../package.json"),
        ];
        expect(checkUiPackageLayers(files)).toEqual([
            expect.stringContaining("confirm-dialog.svelte imports ../../../apps/desktop/src/lib/locales/en.json"),
            expect.stringContaining("a.test.ts imports ../../../apps/web/src/lib/content/links"),
        ]);
    });
});
