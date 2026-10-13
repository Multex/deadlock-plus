import { readdirSync, readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { install, type DemoHandle } from "./scenario";
import { scenarios } from "./scenarios";

const APP_SRC = new URL("../../../apps/desktop/src/", import.meta.url);

/** By scenario id: commands the frontend invokes and that scenario leaves unanswered on purpose, each with its reason. */
const NOT_COVERED: Record<string, Record<string, string>> = {};

/** Files that call Tauri's `invoke` directly instead of going through `command`. */
const DIRECT_INVOKE = ["lib/core/kv.ts", "lib/core/files.ts"];
/** Commands whose name reaches `command` through a variable, and the file that names them. */
const BY_VARIABLE = { file: "lib/features/gamedata/gamedata.ts", names: ["game_item_art", "game_ability_art"] };

const COMMAND_CALL = /\bcommand(?:<[^;(]*?>)?\(\s*"([a-z0-9_]+)"/g;
const INVOKE_CALL = /\binvoke(?:<[^;(]*?>)?\(\s*"([a-z0-9_]+)"/g;

function sourceFiles(dir: URL): URL[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry: { name: string; isDirectory(): boolean }) => {
        if (entry.isDirectory()) return sourceFiles(new URL(`${entry.name}/`, dir));
        const source = /\.(ts|svelte)$/.test(entry.name) && !/\.(test|spec)\.ts$/.test(entry.name);
        return source ? [new URL(entry.name, dir)] : [];
    });
}

const read = (file: URL): string => readFileSync(file, "utf8");
const names = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].map((match) => match[1]!);

function invokedCommands(): string[] {
    const found = new Set<string>();
    for (const file of sourceFiles(APP_SRC)) for (const name of names(read(file), COMMAND_CALL)) found.add(name);
    for (const file of DIRECT_INVOKE) {
        const direct = names(read(new URL(file, APP_SRC)), INVOKE_CALL);
        expect(direct, `${file} no longer calls invoke with a literal name`).not.toEqual([]);
        for (const name of direct) found.add(name);
    }
    const byVariable = read(new URL(BY_VARIABLE.file, APP_SRC));
    for (const name of BY_VARIABLE.names) {
        expect(byVariable, `${BY_VARIABLE.file} no longer names ${name}`).toContain(`"${name}"`);
        found.add(name);
    }
    return [...found].sort();
}

let handle: DemoHandle | undefined;
afterEach(() => {
    handle?.uninstall();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it("covers no scenario that is not in the registry", () => {
    expect(Object.keys(NOT_COVERED).filter((id) => !(id in scenarios))).toEqual([]);
});

it.each(Object.keys(scenarios))(
    "%s answers every command the frontend invokes, or lists it as not covered",
    async (id) => {
        const invoked = invokedCommands();
        expect(invoked.length).toBeGreaterThan(100);
        const notCovered = NOT_COVERED[id] ?? {};

        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.stubGlobal("fetch", async () => Response.json([]));
        handle = install(scenarios[id]!({ appVersion: "0.0.0", changelog: "", mapItemsTsv: "" }));
        for (const name of invoked) {
            try {
                await handle.invoke(name, {});
            } catch {
                // Only whether something answered matters here; a handler may well reject empty arguments.
            }
        }

        const unanswered = handle.unhandled();
        expect(unanswered.filter((name) => !(name in notCovered))).toEqual([]);
        expect(Object.keys(notCovered).filter((name) => !unanswered.includes(name))).toEqual([]);
    },
);
