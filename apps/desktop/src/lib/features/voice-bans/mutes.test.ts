import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";

const { answers, current } = vi.hoisted(() => ({
    answers: new Map<string, () => unknown>(),
    current: { store: null as unknown },
}));
vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async (name: string) => answers.get(name)?.()),
    fileSrc: (path: string) => path,
    listen: vi.fn(async () => () => {}),
}));

// The page loads in onMount, which never runs under svelte/server, so the test loads the store the
// page will render beforehand and hands that instance to the page's constructor call.
vi.mock("$lib/features/voice-bans/mutes.svelte", async (original) => {
    const real = (await original()) as typeof import("./mutes.svelte");
    return {
        ...real,
        Mutes: class {
            constructor() {
                return current.store as never;
            }
        },
    };
});

import { readVoiceBan } from "./api";
import MutesPage from "../../../routes/(app)/voice-bans/+page.svelte";

const { Mutes } = await vi.importActual<typeof import("./mutes.svelte")>("./mutes.svelte");
type Mutes = InstanceType<typeof Mutes>;
import ListError from "./components/list-error.svelte";

const FILE = { path: "C:/voice_ban.dat", exists: false, text: "", gameRunning: false };

function renderError(m: Mutes) {
    return render(ListError, { props: { onretry: () => void m.load() } }).body;
}

describe("mute list load failure", () => {
    beforeEach(() => {
        answers.clear();
        answers.set("read_voice_ban", () => FILE);
    });

    it("rejects a read_voice_ban answer that is not a mute file", async () => {
        answers.set("read_voice_ban", () => null);
        await expect(readVoiceBan()).rejects.toThrow();
        answers.set("read_voice_ban", () => ({ ...FILE, exists: "yes" }));
        await expect(readVoiceBan()).rejects.toThrow();
    });

    for (const [label, answer] of [
        ["throws", () => Promise.reject({ code: "common.internal" })],
        ["answers null", () => null],
    ] as const) {
        it(`shows a calm region error with a retry when read_voice_ban ${label}`, async () => {
            answers.set("read_voice_ban", answer);
            const m = new Mutes();
            await m.load();
            expect(m.loading).toBe(false);
            expect(m.noAccount).toBe(false);
            expect(m.error).toBeTruthy();
            expect(m.error).not.toContain("Cannot read");
            expect(m.error).not.toContain("Check the log");
            const body = renderError(m);
            expect(body).toContain('data-region="voice-bans-list"');
            expect(body).toContain('data-region-state="error"');
            expect(body).toContain("Retry");
            expect(body).not.toContain("Check the log");
            expect(body).not.toContain("Something went wrong");
            expect(body).not.toContain("Reading your mute list");
        });
    }

    it("the Mutes page shows the region error in place of the list", async () => {
        answers.set("read_voice_ban", () => null);
        const m = new Mutes();
        current.store = m;
        await m.load();
        const body = render(MutesPage).body;
        expect(body).toContain('data-region="voice-bans-list"');
        expect(body).toContain("Couldn't read your mute list.");
        expect(body).not.toContain("Reading your mute list");
    });

    it("keeps the no-account state apart from a failure", async () => {
        answers.set("read_voice_ban", () => Promise.reject({ code: "voice_bans.no_account" }));
        const m = new Mutes();
        await m.load();
        expect(m.noAccount).toBe(true);
        expect(m.error).toBeNull();
    });

    it("retry reloads the list after a failure", async () => {
        answers.set("read_voice_ban", () => null);
        const m = new Mutes();
        await m.load();
        expect(m.error).toBeTruthy();
        answers.set("read_voice_ban", () => FILE);
        await m.load();
        expect(m.error).toBeNull();
        expect(m.file).toEqual(FILE);
    });
});
