import { describe, expect, it } from "vitest";
import {
    ALL_CLIENT_KINDS,
    DEFAULT_PRESENCE,
    DEFAULT_DEADLOCK_PLUS_LOGO,
    DEFAULT_DELAY_SECS,
    DELAY_RANGE,
    MAX_DELAY_SECS,
    clientLabel,
    delayLabel,
    delaySecsOf,
    discordBarCopy,
    discordBarState,
    heroArtMap,
    patchPresence,
    PRESENCE_LEVELS,
    resolvePresence,
    runningKinds,
    runningLine,
    showsDeadlockPlusLogo,
    toggleClient,
} from "./presence";

import type { PresenceStatus } from "@deadlock-plus/ipc-types/PresenceStatus";

describe("resolvePresence", () => {
    it("defaults to off with every client", () => {
        expect(resolvePresence(undefined)).toEqual({
            level: "off",
            clients: ["stable", "ptb", "canary", "other"],
            supportButton: true,
        });
        expect(DEFAULT_PRESENCE.clients).toEqual(ALL_CLIENT_KINDS);
    });

    it("keeps a valid stored value", () => {
        expect(resolvePresence({ level: "basic", clients: ["ptb"] })).toEqual({
            level: "basic",
            clients: ["ptb"],
            supportButton: true,
        });
    });

    it("keeps the detailed level", () => {
        expect(resolvePresence({ level: "detailed" }).level).toBe("detailed");
        expect(PRESENCE_LEVELS).toEqual(["off", "basic", "detailed"]);
    });

    it("defaults the support button on and keeps a stored choice", () => {
        expect(resolvePresence(undefined).supportButton).toBe(true);
        expect(resolvePresence({ level: "basic", clients: [] }).supportButton).toBe(true);
        expect(resolvePresence({ level: "basic", clients: [], supportButton: false }).supportButton).toBe(false);
        expect(resolvePresence({ supportButton: "no" }).supportButton).toBe(true);
    });

    it("leaves the Deadlock+ logo choice unset, and off, until one is stored", () => {
        expect(DEFAULT_DEADLOCK_PLUS_LOGO).toBe(false);
        const unset = resolvePresence({ level: "basic", clients: [] });
        expect("deadlockPlusLogo" in unset).toBe(false);
        expect(showsDeadlockPlusLogo(unset)).toBe(false);
        expect("deadlockPlusLogo" in resolvePresence({ deadlockPlusLogo: "yes" })).toBe(false);
        expect(showsDeadlockPlusLogo(resolvePresence({ deadlockPlusLogo: true }))).toBe(true);
        expect(resolvePresence({ deadlockPlusLogo: false }).deadlockPlusLogo).toBe(false);
    });

    it("keeps an explicitly empty client list", () => {
        expect(resolvePresence({ level: "basic", clients: [] }).clients).toEqual([]);
    });

    it("drops unknown clients and duplicates, in canonical order", () => {
        expect(resolvePresence({ level: "basic", clients: ["canary", "bogus", "stable", "canary"] }).clients).toEqual([
            "stable",
            "canary",
        ]);
    });

    it("falls back per field on junk", () => {
        expect(resolvePresence({ level: "loud", clients: "all" })).toEqual(DEFAULT_PRESENCE);
        expect(resolvePresence(42)).toEqual(DEFAULT_PRESENCE);
    });

    it("returns a fresh client array", () => {
        expect(resolvePresence(undefined).clients).not.toBe(DEFAULT_PRESENCE.clients);
    });
});

describe("patchPresence", () => {
    it("stores the Deadlock+ logo choice when it differs from the default", () => {
        const next = patchPresence(DEFAULT_PRESENCE, { deadlockPlusLogo: !DEFAULT_DEADLOCK_PLUS_LOGO });
        expect(next.deadlockPlusLogo).toBe(!DEFAULT_DEADLOCK_PLUS_LOGO);
        expect(showsDeadlockPlusLogo(next)).toBe(!DEFAULT_DEADLOCK_PLUS_LOGO);
    });

    it("drops the Deadlock+ logo key when set back to the default", () => {
        const on = patchPresence(DEFAULT_PRESENCE, { deadlockPlusLogo: true });
        const off = patchPresence(on, { deadlockPlusLogo: DEFAULT_DEADLOCK_PLUS_LOGO });
        expect("deadlockPlusLogo" in off).toBe(false);
        expect(showsDeadlockPlusLogo(off)).toBe(DEFAULT_DEADLOCK_PLUS_LOGO);
    });

    it("keeps an unset Deadlock+ logo choice unset when other fields change", () => {
        const next = patchPresence(DEFAULT_PRESENCE, { level: "basic" });
        expect(next).toStrictEqual({ ...DEFAULT_PRESENCE, level: "basic" });
        expect(
            patchPresence({ ...DEFAULT_PRESENCE, deadlockPlusLogo: true }, { level: "basic" }).deadlockPlusLogo,
        ).toBe(true);
    });
});

describe("presence delay", () => {
    it("leaves the delay unset, and zero, until one is stored", () => {
        expect(DEFAULT_DELAY_SECS).toBe(0);
        const unset = resolvePresence({ level: "basic", clients: [] });
        expect("delaySecs" in unset).toBe(false);
        expect(delaySecsOf(unset)).toBe(0);
        expect(delaySecsOf(resolvePresence({ delaySecs: 30 }))).toBe(30);
    });

    it("ignores a stored delay that is not a number of seconds", () => {
        for (const junk of ["30", -5, Number.NaN, Number.POSITIVE_INFINITY, null, true]) {
            expect("delaySecs" in resolvePresence({ delaySecs: junk }), String(junk)).toBe(false);
        }
        expect("delaySecs" in resolvePresence({ delaySecs: 0 })).toBe(false);
    });

    it("clamps a stored delay to two minutes and whole seconds", () => {
        expect(MAX_DELAY_SECS).toBe(120);
        expect(resolvePresence({ delaySecs: 500 }).delaySecs).toBe(120);
        expect(resolvePresence({ delaySecs: 12.6 }).delaySecs).toBe(13);
    });

    it("stores a delay other than the default", () => {
        expect(patchPresence(DEFAULT_PRESENCE, { delaySecs: 30 }).delaySecs).toBe(30);
        expect(patchPresence(DEFAULT_PRESENCE, { delaySecs: 500 }).delaySecs).toBe(120);
    });

    it("drops the delay key when set back to zero", () => {
        const held = patchPresence(DEFAULT_PRESENCE, { delaySecs: 30 });
        const none = patchPresence(held, { delaySecs: 0 });
        expect("delaySecs" in none).toBe(false);
        expect(patchPresence(held, { level: "basic" }).delaySecs).toBe(30);
        expect(patchPresence(DEFAULT_PRESENCE, { level: "basic" })).toStrictEqual({
            ...DEFAULT_PRESENCE,
            level: "basic",
        });
    });

    it("steps the slider by five seconds up to two minutes", () => {
        expect(DELAY_RANGE).toEqual({ min: 0, max: 120, step: 5 });
    });

    it("reads Off at zero and seconds otherwise", () => {
        expect(delayLabel(0)).toBe("Off");
        expect(delayLabel(30)).toBe("30 s");
        expect(delayLabel(120)).toBe("120 s");
    });
});

describe("toggleClient", () => {
    it("adds in canonical order", () => {
        expect(toggleClient(["canary"], "stable", true)).toEqual(["stable", "canary"]);
    });

    it("removes", () => {
        expect(toggleClient(["stable", "ptb"], "stable", false)).toEqual(["ptb"]);
    });

    it("is idempotent", () => {
        expect(toggleClient(["stable"], "stable", true)).toEqual(["stable"]);
    });
});

describe("clientLabel", () => {
    it("names the known builds", () => {
        expect(clientLabel({ kind: "stable", pipeIndex: 0, connected: true })).toBe("Discord");
        expect(clientLabel({ kind: "ptb", pipeIndex: 1, connected: true })).toBe("Discord PTB");
        expect(clientLabel({ kind: "canary", pipeIndex: 2, connected: true })).toBe("Discord Canary");
    });

    it("shows the pipe for other clients", () => {
        expect(clientLabel({ kind: "other", pipeIndex: 4, connected: true })).toBe("Discord app 4");
    });
});

describe("runningLine", () => {
    const status = (over: Partial<PresenceStatus> = {}): PresenceStatus => ({
        running: true,
        clients: [],
        link: "notFound",
        ...over,
    });

    it("says off when presence is off", () => {
        expect(runningLine(false, status())).toBe("Off");
    });

    it("is empty until the first status arrives", () => {
        expect(runningLine(true, null)).toBe("");
    });

    it("reports no Discord found", () => {
        expect(runningLine(true, status())).toBe("No running Discord found.");
    });

    it("waits for Deadlock when Discord runs and the game is closed", () => {
        const line = runningLine(
            true,
            status({ running: false, link: "waiting", clients: [{ kind: "stable", pipeIndex: 0, connected: false }] }),
        );
        expect(line).toBe("Discord is running. Waiting for Deadlock to start.");
    });

    it("reports connecting while the game runs and Discord has not answered", () => {
        const line = runningLine(
            true,
            status({ link: "connecting", clients: [{ kind: "ptb", pipeIndex: 1, connected: false }] }),
        );
        expect(line).toBe("Connecting to Discord.");
    });

    it("lists connected clients only", () => {
        const line = runningLine(
            true,
            status({
                link: "connected",
                clients: [
                    { kind: "stable", pipeIndex: 0, connected: true },
                    { kind: "ptb", pipeIndex: 1, connected: false },
                    { kind: "other", pipeIndex: 3, connected: true },
                ],
            }),
        );
        expect(line).toBe("Showing on: Discord, Discord app 3.");
    });

    it("never says Discord is missing while a Discord is running", () => {
        const found = [{ kind: "ptb", pipeIndex: 1, connected: false }] as const;
        for (const link of ["waiting", "connecting"] as const) {
            expect(runningLine(true, status({ link, clients: [...found] }))).not.toBe("No running Discord found.");
        }
    });
});

describe("discordBarState", () => {
    const status = (link: PresenceStatus["link"], running = true): PresenceStatus => ({
        running,
        clients: link === "notFound" ? [] : [{ kind: "stable", pipeIndex: 0, connected: link === "connected" }],
        link,
    });

    it("is off when presence is off, whatever Discord is doing", () => {
        expect(discordBarState(false, status("connected"))).toBe("off");
    });

    it("is checking until the first status arrives", () => {
        expect(discordBarState(true, null)).toBe("checking");
    });

    it("follows the link the app reports", () => {
        expect(discordBarState(true, status("notFound"))).toBe("missing");
        expect(discordBarState(true, status("waiting", false))).toBe("waiting");
        expect(discordBarState(true, status("connecting"))).toBe("connecting");
        expect(discordBarState(true, status("connected"))).toBe("connected");
    });
});

describe("discordBarCopy", () => {
    it("labels each state", () => {
        expect(discordBarCopy("off")).toEqual({
            label: "Discord off",
            title: "Discord presence is off. Click to set it up.",
        });
        expect(discordBarCopy("checking")).toEqual({ label: "Looking for Discord", title: "Looking for Discord" });
        expect(discordBarCopy("missing")).toEqual({
            label: "Discord not found",
            title: "Discord presence is on, but no running Discord was found",
        });
        expect(discordBarCopy("waiting")).toEqual({
            label: "Waiting for Deadlock",
            title: "Discord is running. Your activity shows once Deadlock starts.",
        });
        expect(discordBarCopy("connecting")).toEqual({
            label: "Connecting to Discord",
            title: "Deadlock is running. Connecting to Discord.",
        });
        expect(discordBarCopy("connected")).toEqual({
            label: null,
            title: "Showing your Deadlock activity on Discord",
        });
    });
});

describe("runningKinds", () => {
    it("is empty before the first status arrives", () => {
        expect(runningKinds(null).size).toBe(0);
    });

    it("lists each kind that has a discovered client, connected or not", () => {
        const kinds = runningKinds({
            running: false,
            clients: [
                { kind: "stable", pipeIndex: 0, connected: false },
                { kind: "other", pipeIndex: 2, connected: false },
            ],
            link: "waiting",
        });
        expect([...kinds].sort()).toEqual(["other", "stable"]);
    });
});

describe("heroArtMap", () => {
    it("maps id to name and art", () => {
        expect(
            heroArtMap({
                1: {
                    id: 1,
                    name: "Infernus",
                    icon: "a.webp",
                    portrait: "card.png",
                    artIcon: "sm.png",
                    hideoutLine: "Mixing Drinks in the Hideout",
                },
                7: { id: 7, name: "Seven", icon: null, portrait: null, artIcon: null, hideoutLine: null },
            }),
        ).toEqual({
            1: { name: "Infernus", portrait: "card.png", icon: "sm.png", hideoutLine: "Mixing Drinks in the Hideout" },
            7: { name: "Seven", portrait: null, icon: null, hideoutLine: null },
        });
    });

    it("sends API URLs to Discord, never local file paths", () => {
        expect(
            heroArtMap({
                1: {
                    id: 1,
                    name: "Infernus",
                    icon: null,
                    portrait: "asset://localhost/C%3A/cache/1_card.png",
                    artIcon: "asset://localhost/C%3A/cache/1_sm.png",
                    apiPortrait: "https://cdn/card.png",
                    apiArtIcon: "https://cdn/sm.png",
                    hideoutLine: null,
                },
                2: {
                    id: 2,
                    name: "Local only",
                    icon: null,
                    portrait: "asset://localhost/C%3A/cache/2_card.png",
                    artIcon: "asset://localhost/C%3A/cache/2_sm.png",
                    apiPortrait: null,
                    apiArtIcon: null,
                    hideoutLine: null,
                },
            }),
        ).toEqual({
            1: { name: "Infernus", portrait: "https://cdn/card.png", icon: "https://cdn/sm.png", hideoutLine: null },
            2: { name: "Local only", portrait: null, icon: null, hideoutLine: null },
        });
    });

    it("is empty for no heroes", () => {
        expect(heroArtMap({})).toEqual({});
    });
});
