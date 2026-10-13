import type { JobsSnapshot } from "@deadlock-plus/ipc-types/JobsSnapshot";
import type { LiveState } from "@deadlock-plus/ipc-types/LiveState";
import type { NetworkSnapshot } from "@deadlock-plus/ipc-types/NetworkSnapshot";
import type { VoiceBanFile } from "@deadlock-plus/ipc-types/VoiceBanFile";
import { afterEach, describe, expect, it } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { defaultScenario } from "./index";

const OPTIONS = { appVersion: "1.2.3", changelog: "# Changelog\n", mapItemsTsv: "" };

describe("default scenario game state", () => {
    let handle: DemoHandle | undefined;
    afterEach(() => handle?.uninstall());

    it("says Deadlock is closed through every command that reports it", () => {
        handle = install(defaultScenario(OPTIONS));

        expect(handle.invoke("is_game_running", {})).toBe(false);
        expect(handle.invoke("get_live_state", {}) as LiveState).toEqual({ phase: "gameClosed", matchPresent: false });
        expect((handle.invoke("jobs_snapshot", {}) as JobsSnapshot).gameRunning).toBe(false);
        expect((handle.invoke("read_voice_ban", {}) as VoiceBanFile).gameRunning).toBe(false);

        const snapshot = handle.invoke("network_snapshot", {}) as NetworkSnapshot;
        const poll = handle.invoke("network_poll", { sinceT: null }) as { snapshot: NetworkSnapshot };
        for (const network of [snapshot, poll.snapshot]) {
            expect(network).toMatchObject({ gameRunning: false, relay: null });
        }
    });
});
