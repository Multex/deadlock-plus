import { beforeEach, describe, expect, it, vi } from "vitest";

const stored = new Map<string, boolean>();

vi.mock("$lib/core/prefs", () => ({
    prefs: {
        getBool: (key: string, fallback: boolean) => stored.get(key) ?? fallback,
        setBool: (key: string, value: boolean) => void stored.set(key, value),
    },
}));

async function freshState() {
    vi.resetModules();
    return (await import("./sidebar-state.svelte")).sidebarState;
}

interface Entry {
    href: string;
    group?: "tools";
    badge?: () => number;
}

const home: Entry = { href: "/" };
const stats: Entry = { href: "/stats" };
const mutes: Entry = { href: "/voice-bans", group: "tools" };
const replays: Entry = { href: "/demos", group: "tools", badge: () => 2 };

describe("sidebarState tools group", () => {
    beforeEach(() => stored.clear());

    it("starts open", async () => {
        expect((await freshState()).toolsOpen).toBe(true);
    });

    it("remembers the last choice across restarts", async () => {
        (await freshState()).toggleTools();

        const restarted = await freshState();

        expect(restarted.toolsOpen).toBe(false);
        restarted.toggleTools();
        expect((await freshState()).toolsOpen).toBe(true);
    });

    it("keeps the sidebar collapse separate", async () => {
        const state = await freshState();
        state.toggleTools();

        expect(state.collapsed).toBe(false);
    });
});

describe("splitNav", () => {
    it("puts grouped entries in tools and keeps the order of both lists", async () => {
        const { splitNav } = await import("./sidebar-state.svelte");

        expect(splitNav([home, mutes, stats, replays])).toEqual({ main: [home, stats], tools: [mutes, replays] });
    });
});

describe("shownTools", () => {
    const active = (path: string) => (href: string) => href === path;

    it("shows every tool while open", async () => {
        const { shownTools } = await import("./sidebar-state.svelte");

        expect(shownTools([mutes, replays], true, active("/"))).toEqual([mutes, replays]);
    });

    it("shows only the open page while closed", async () => {
        const { shownTools } = await import("./sidebar-state.svelte");

        expect(shownTools([mutes, replays], false, active("/demos"))).toEqual([replays]);
        expect(shownTools([mutes, replays], false, active("/"))).toEqual([]);
    });
});

describe("hiddenBadge", () => {
    it("adds up the badges of tools that are not shown", async () => {
        const { hiddenBadge } = await import("./sidebar-state.svelte");

        expect(hiddenBadge([mutes, replays], [])).toBe(2);
        expect(hiddenBadge([mutes, replays], [replays])).toBe(0);
        expect(hiddenBadge([mutes], [])).toBe(0);
    });
});
