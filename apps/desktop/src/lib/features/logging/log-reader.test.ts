import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";

const { answers, current } = vi.hoisted(() => ({
    answers: new Map<string, () => unknown>(),
    current: { reader: null as unknown },
}));
vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async (name: string) => answers.get(name)?.()),
    listen: vi.fn(async () => () => {}),
}));
// The view loads in onMount, which never runs under svelte/server, so the test loads the reader the
// view will render beforehand and hands that instance to the view's constructor call.
vi.mock("$lib/features/logging/log-reader.svelte", async (original) => {
    const real = (await original()) as typeof import("./log-reader.svelte");
    return {
        ...real,
        LogReader: class {
            constructor(read: never) {
                return (current.reader ?? new real.LogReader(read)) as never;
            }
        },
    };
});

import { readLogs } from "./logs";
import LogView from "./components/log-view.svelte";

const { LogReader } = await vi.importActual<typeof import("./log-reader.svelte")>("./log-reader.svelte");

const ENTRY = { time: "12:00:00", thread: "main", level: "INFO", logger: "tray", message: "ok" };

describe("readLogs", () => {
    beforeEach(() => answers.clear());

    it("rejects an answer that is not a list of log entries", async () => {
        for (const answer of [null, { garbage: true }, [{ ...ENTRY, message: 3 }]]) {
            answers.set("read_logs", () => answer);
            await expect(readLogs()).rejects.toThrow();
        }
    });

    it("passes a good answer through", async () => {
        answers.set("read_logs", () => [ENTRY]);
        await expect(readLogs()).resolves.toEqual([ENTRY]);
    });
});

describe("log view", () => {
    beforeEach(() => {
        answers.clear();
        current.reader = null;
    });

    for (const [label, answer] of [
        ["garbage", () => ({ garbage: true })],
        ["null", () => null],
    ] as const) {
        it(`shows Couldn't read the log when read_logs answers ${label}`, async () => {
            answers.set("read_logs", answer);
            const reader = new LogReader(readLogs);
            current.reader = reader;
            await reader.load();

            expect(reader.entries).toBeNull();
            const body = render(LogView).body;
            expect(body).toContain("Couldn't read the log.");
            expect(body).not.toContain("Loading");
        });
    }

    it("shows the entries once they load", async () => {
        answers.set("read_logs", () => [ENTRY]);
        const reader = new LogReader(readLogs);
        current.reader = reader;
        await reader.load();

        const body = render(LogView).body;
        expect(body).toContain("[tray]");
        expect(body).not.toContain("Couldn't read the log.");
    });
});
