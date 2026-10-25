import type { PresenceCard } from "@deadlock-plus/ipc-types/PresenceCard";
import type { PresenceConfig } from "@deadlock-plus/ipc-types/PresenceConfig";
import type { PresencePlaceholder } from "@deadlock-plus/ipc-types/PresencePlaceholder";
import type { PresenceSample } from "@deadlock-plus/ipc-types/PresenceSample";
import type { PresenceStateId } from "@deadlock-plus/ipc-types/PresenceStateId";
import type { PresenceStateInfo } from "@deadlock-plus/ipc-types/PresenceStateInfo";
import { afterEach, describe, expect, it } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { defaultScenario } from "./index";

const OPTIONS = { appVersion: "1.2.3", changelog: "# Changelog\n", mapItemsTsv: "" };

// Every state the editor has a label and an icon for; the record fails to compile when the list falls behind.
const EDITOR_STATES: Record<PresenceStateId, true> = {
    playing: true,
    mainMenu: true,
    hideout: true,
    findingMatch: true,
    matchFound: true,
    preGame: true,
    inMatch: true,
    streetBrawlRound: true,
    paused: true,
    spectating: true,
    postGame: true,
    privateLobby: true,
    practice: true,
};

const SAMPLE: PresenceSample = {
    heroName: "Lash",
    heroPortrait: "https://example.test/lash-portrait.png",
    heroIcon: "https://example.test/lash-icon.png",
    rankName: "Emissary",
    heroPresence: "Flexing in the Hideout",
};
const EMPTY: PresenceConfig = { states: {}, variants: {}, heroes: {} };

describe("default scenario: Discord activity", () => {
    const handles: DemoHandle[] = [];
    const start = () => {
        const handle = install(defaultScenario(OPTIONS));
        handles.push(handle);
        return handle;
    };
    const preview = (handle: DemoHandle, args: Record<string, unknown>) =>
        handle.invoke("presence_preview", {
            config: EMPTY,
            variant: null,
            heroId: null,
            sample: null,
            ...args,
        }) as PresenceCard | null;
    const line = (handle: DemoHandle, template: string) =>
        preview(handle, { config: { ...EMPTY, states: { playing: { details: template } } }, state: "playing" })
            ?.details;
    afterEach(() => {
        while (handles.length) handles.pop()!.uninstall();
    });

    it("lays out every state the editor draws, with the variants of each", () => {
        const layout = start().invoke("presence_layout", {}) as PresenceStateInfo[];
        expect(layout.map((state) => state.id)).toEqual(Object.keys(EDITOR_STATES));
        const byId = Object.fromEntries(layout.map((state) => [state.id, state]));
        expect(byId.inMatch).toEqual({
            id: "inMatch",
            variants: ["unranked", "ranked", "bots", "tutorial", "sandbox", "exploreNyc"],
            heroScope: true,
        });
        expect(byId.postGame!.variants).toEqual(["won", "lost", "unscored"]);
        expect(byId.hideout!.variants).toEqual(["solo", "party"]);
        expect(byId.findingMatch!.variants).toEqual(["unranked", "ranked", "bots", "streetBrawl"]);
        expect(layout.filter((state) => !state.heroScope).map((state) => state.id)).toEqual([
            "playing",
            "mainMenu",
            "spectating",
            "privateLobby",
        ]);
    });

    it("lists the placeholders a template may use and marks the one that identifies a match", () => {
        const placeholders = start().invoke("presence_placeholders", {}) as PresencePlaceholder[];
        expect(placeholders).toHaveLength(18);
        expect(placeholders.slice(0, 5).map((p) => p.name)).toEqual([
            "hero",
            "heroPresence",
            "mode",
            "gameMode",
            "rank",
        ]);
        expect(placeholders.filter((p) => p.sensitive).map((p) => p.name)).toEqual(["matchId"]);
    });

    it("writes out the built-in slot of every state and of the variants that differ", () => {
        const handle = start();
        const defaults = handle.invoke("presence_defaults", {}) as PresenceConfig;
        expect(Object.keys(defaults.states)).toEqual(Object.keys(EDITOR_STATES));
        expect(defaults.states.inMatch).toEqual({
            enabled: true,
            details: "In a match",
            state: "[[Playing as {hero}]]",
            largeImage: { enabled: true, source: "heroIcon" },
            smallImage: { enabled: false, source: "rankBadge" },
            largeText: "{hero}",
            smallText: "{rank}",
            timer: "matchTime",
        });
        expect(defaults.states.spectating).toMatchObject({ largeImage: { enabled: false }, largeText: "" });
        expect(defaults.variants.inMatch!.ranked).toEqual({ details: "Playing Ranked", smallImage: { enabled: true } });
        expect(defaults.variants.hideout).toEqual({
            party: { state: "[[In a party of {partySize} as {hero}||In a party of {partySize}]]" },
        });
        expect(defaults.variants.findingMatch!.bots).toEqual({ details: "Setting up a bot match" });
        expect(handle.invoke("presence_config", {})).toEqual(EMPTY);
    });

    it("gives every state the built-in timer the app gives it", () => {
        // Pinned beside the same table in the Rust test `every_state_keeps_its_built_in_timer`; change both together.
        const timers = Object.fromEntries(
            Object.entries((start().invoke("presence_defaults", {}) as PresenceConfig).states).map(([id, slot]) => [
                id,
                slot!.timer,
            ]),
        );
        expect(timers).toEqual({
            playing: "elapsedInState",
            mainMenu: "elapsedInState",
            hideout: "matchTime",
            findingMatch: "queueTime",
            matchFound: "elapsedInState",
            preGame: "elapsedInState",
            inMatch: "matchTime",
            streetBrawlRound: "matchTime",
            paused: "none",
            spectating: "matchTime",
            postGame: "elapsedInState",
            privateLobby: "elapsedInState",
            practice: "elapsedInState",
        });
    });

    it("previews a ranked match with the hero, the rank badge and the match timer", () => {
        const card = preview(start(), { state: "inMatch", variant: "ranked", sample: SAMPLE });
        expect(card).toEqual({
            details: "Playing Ranked",
            state: "Playing as Lash",
            largeText: "Lash",
            smallText: "Emissary 2",
            largeImage: SAMPLE.heroIcon,
            smallImage: "https://api.deadlock-api.com/v1/assets/ranks/5/2/image",
            elapsedSecs: 754,
            party: [3, 6],
        });
    });

    it("previews the other states as the app does", () => {
        const handle = start();
        expect(preview(handle, { state: "playing" })).toEqual({
            details: "Playing Deadlock",
            state: null,
            largeText: "Haze",
            smallText: null,
            largeImage: null,
            smallImage: null,
            elapsedSecs: 754,
            party: [3, 6],
        });
        expect(preview(handle, { state: "findingMatch", variant: "ranked" })).toMatchObject({
            details: "Looking for a Ranked match",
            elapsedSecs: 75,
        });
        expect(preview(handle, { state: "paused", variant: "unranked" })).toMatchObject({
            details: "Playing Unranked",
            elapsedSecs: null,
        });
        expect(preview(handle, { state: "streetBrawlRound" })).toMatchObject({ state: "Round 3", party: [3, 4] });
        expect(preview(handle, { state: "postGame", variant: "won" })).toMatchObject({ state: "Won" });
        expect(preview(handle, { state: "hideout", variant: "solo" })).toMatchObject({
            state: "Hanging out as Haze",
            party: null,
        });
        expect(preview(handle, { state: "hideout", variant: "party" })).toMatchObject({
            state: "In a party of 3 as Haze",
        });
        expect(preview(handle, { state: "privateLobby" })).toMatchObject({
            details: "In a private match",
            party: null,
        });
    });

    it("layers the edited config over the built-in slots and sends nothing for a state that is off", () => {
        const handle = start();
        const config: PresenceConfig = {
            states: { inMatch: { details: "state" }, mainMenu: { enabled: false } },
            variants: { inMatch: { ranked: { details: "variant" } } },
            heroes: { 31: { states: { inMatch: { details: "hero" } }, variants: {} } },
        };
        expect(preview(handle, { config, state: "inMatch", variant: "ranked", heroId: 31 })?.details).toBe("variant");
        expect(preview(handle, { config, state: "inMatch", variant: "unranked", heroId: 31 })?.details).toBe("hero");
        expect(preview(handle, { config, state: "inMatch", variant: "unranked" })?.details).toBe("state");
        expect(preview(handle, { config, state: "mainMenu" })).toBeNull();
    });

    it("renders placeholders, groups and the separators around an empty value as the app does", () => {
        const handle = start();
        expect(line(handle, "Playing as {hero}")).toBe("Playing as Haze");
        expect(line(handle, "Rank {rank}")).toBe("Rank");
        expect(line(handle, "[[Playing as {hero}]]")).toBe("Playing as Haze");
        expect(line(handle, "[[Rank {rank}]]")).toBeNull();
        expect(line(handle, "[[Rank {rank}||Unranked]]")).toBe("Unranked");
        expect(line(handle, "[[{rank} in {mode}||{mode}||Playing]]")).toBe("Playing");
        expect(line(handle, "{hero} ({rank}) - {kills}/{deaths}/{assists}")).toBe("Haze 12/3/8");
        expect(line(handle, "{rank} - {mode} - {hero}")).toBe("Haze");
        expect(line(handle, "{hero} [{mode}], {kills}")).toBe("Haze 12");
        expect(line(handle, "{souls} souls, {elapsed}, match {matchId}")).toBe("24.1k souls, 12:34, match 123456789");
        expect(line(handle, "{nope} [[Hello")).toBe("{nope} [[Hello");
        expect(line(handle, "x")).toBe("x​");
    });
});
