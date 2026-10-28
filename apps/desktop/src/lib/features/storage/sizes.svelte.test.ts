import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire, stripTypeScriptTypes } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileModule } from "svelte/compiler";
import type { EntryStats } from "./storage";
import { StorageSizes, type RowSize } from "./sizes.svelte";

const stat = (bytes: number): EntryStats => ({ bytes, count: null, oldestSecs: null });

// Vitest compiles Svelte for the server, where `$state` is a plain value and nothing re-renders, so a
// row stuck on its spinner cannot show up there. This compiles the store for the client and runs it
// on the client runtime, where a mutation that is not tracked never reruns the effect watching it.
const here = path.dirname(fileURLToPath(import.meta.url));
const svelteRoot = path.dirname(createRequire(import.meta.url).resolve("svelte/package.json"));
const clientRuntime = pathToFileURL(path.join(svelteRoot, "src/internal/client/index.js")).href;
const clientReactivity = pathToFileURL(path.join(svelteRoot, "src/reactivity/index-client.js")).href;

type ClientRuntime = {
    effect_root: (fn: () => void) => () => void;
    user_effect: (fn: () => void) => void;
    flush: () => void;
};

async function loadClient(): Promise<{ ClientSizes: typeof StorageSizes; rt: ClientRuntime }> {
    const source = fs.readFileSync(path.join(here, "sizes.svelte.ts"), "utf8");
    const code = compileModule(stripTypeScriptTypes(source), { generate: "client", filename: "sizes.svelte.js" })
        .js.code.replace("'svelte/internal/client'", JSON.stringify(clientRuntime))
        .replace('"svelte/reactivity"', JSON.stringify(clientReactivity))
        .replace('"./storage"', JSON.stringify(pathToFileURL(path.join(here, "storage.ts")).href));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "storage-sizes-"));
    const file = path.join(dir, "sizes.client.js");
    fs.writeFileSync(file, code);
    const [mod, rt] = await Promise.all([
        import(/* @vite-ignore */ pathToFileURL(file).href),
        import(/* @vite-ignore */ clientRuntime),
    ]).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
    return { ClientSizes: mod.StorageSizes, rt };
}

function watch<T>(rt: ClientRuntime, read: () => T) {
    const seen: T[] = [];
    const stop = rt.effect_root(() => rt.user_effect(() => void seen.push(read())));
    rt.flush();
    return { seen, stop };
}

describe("StorageSizes on the client runtime", () => {
    it("ends the spinner and shows the failure when measuring a row fails", async () => {
        const { ClientSizes, rt } = await loadClient();
        const sizes = new ClientSizes(() => Promise.reject(new Error("io")));
        const { seen, stop } = watch<RowSize>(rt, () => sizes.row("replays"));
        expect(seen).toEqual(["measuring"]);

        await sizes.measure("replays");
        rt.flush();

        expect(seen).toEqual(["measuring", "failed"]);
        stop();
    });

    it("flips the total to incomplete when a row fails", async () => {
        const { ClientSizes, rt } = await loadClient();
        const sizes = new ClientSizes(() => Promise.reject(new Error("io")));
        const { seen, stop } = watch(rt, () => sizes.incomplete);

        await sizes.measure("replays");
        rt.flush();

        expect(seen).toEqual([false, true]);
        stop();
    });
});

describe("StorageSizes", () => {
    it("clears the failure once a retry measures the row", async () => {
        let fail = true;
        const sizes = new StorageSizes(() => (fail ? Promise.reject(new Error("io")) : Promise.resolve(stat(10))));
        await sizes.measure("replays");
        fail = false;
        await sizes.measure("replays");

        expect(sizes.row("replays")).toBe("measured");
        expect(sizes.incomplete).toBe(false);
    });

    it("sums only measured rows and flags the total as incomplete when a row failed", async () => {
        const sizes = new StorageSizes((id) =>
            id === "replays" ? Promise.reject(new Error("io")) : Promise.resolve(stat(100)),
        );
        await Promise.all([sizes.measure("replays"), sizes.measure("logs")]);

        expect(sizes.total).toBe(100);
        expect(sizes.incomplete).toBe(true);
    });

    it("forgets a failure when the row is cleared, and every failure on reset", async () => {
        const sizes = new StorageSizes(() => Promise.reject(new Error("io")));
        await Promise.all([sizes.measure("replays"), sizes.measure("logs")]);
        sizes.forget("replays");
        expect(sizes.row("replays")).toBe("measuring");
        sizes.reset();

        expect(sizes.row("logs")).toBe("measuring");
        expect(sizes.incomplete).toBe(false);
    });
});
