import type { GcStatus } from "@deadlock-plus/ipc-types/GcStatus";
import type { MinimapArtResult } from "@deadlock-plus/ipc-types/MinimapArtResult";

import type { Handlers } from "../../backend";
import type { ApiRoute } from "../../fetch";
import { defineScenario, type Module, type Scenario } from "../../scenario";
import type { ScenarioOptions } from "../default";
import { adminAccessModule } from "../default/admin-access";
import { buildsModule } from "../default/builds";
import { IDENTITY, NOW_MS, SEED } from "../default/identity";
import { matchDetailModule } from "../default/match-detail";
import { progressModule } from "../default/progress";
import { serverPickerModule } from "../default/server-picker";
import { shellModule } from "../default/shell";
import { supportModule } from "../default/support";
import { upkeepModule } from "../default/upkeep";

type Respond = ApiRoute[1];

/** The error a browser's `fetch` rejects with when the connection cannot be made. */
const dropped: Respond = () => {
    throw new TypeError("Failed to fetch");
};

const unavailable: Respond = () =>
    new Response("503 Service Unavailable", { status: 503, statusText: "Service Unavailable" });

/** Listed first in a scenario, so its one route answers every Deadlock API path before any other module's. */
const outageModule = (respond: Respond): Module => ({
    name: "api-outage",
    create: () => ({ routes: [[/^/, respond]] }),
});

const NO_MINIMAP: MinimapArtResult = { status: "unavailable", local: "noInstall" };

/**
 * The default scenario's game data commands read the public API, which stands in for the installed game's
 * files. With the API gone they answer as the app does when it finds no such files.
 */
function withoutGameData(module: Module): Module {
    const none = (): never[] => [];
    const handlers: Handlers = {
        game_items: none,
        game_item_art: none,
        game_ability_art: none,
        game_accolades: none,
        game_hero_art: none,
        game_hero_backdrop: () => null,
        game_hero_mood: () => null,
        game_minimap_icons: none,
        game_minimap_art: () => NO_MINIMAP,
    };
    return {
        name: module.name,
        create(context, replaced) {
            const parts = module.create(context, replaced);
            return { ...parts, handlers: { ...parts.handlers, ...handlers } };
        },
    };
}

const rateLimited: Respond = () =>
    new Response(
        JSON.stringify({ type: "ip", quota: { limit: 30, period: 60 }, requests: 31, remaining: 0, next_request_in: 12 }),
        {
            status: 429,
            statusText: "Too Many Requests",
            headers: {
                "Content-Type": "application/json",
                "Retry-After": "12",
                "RateLimit-Limit": "30",
                "RateLimit-Period": "60",
                "RateLimit-Remaining": "0",
                "RateLimit-Reset": "12",
            },
        },
    );

/** What the app's own HTTP layer reports to the UI when the API answers 429 and retries run out. */
const NETWORK_ERROR = { code: "common.network", params: {} };

/**
 * The commands that stand for Rust code calling the API: the coverage check fails, and own recovery ends
 * incomplete because it could not read the account history.
 */
const rateLimitedCommandsModule: Module = {
    name: "api-rate-limited-commands",
    overrides: ["match_detail_coverage", "gc_status"],
    create: (_, replaced) => ({
        handlers: {
            match_detail_coverage: () => {
                throw NETWORK_ERROR;
            },
            gc_status: (args) => {
                const status = replaced.gc_status!(args) as GcStatus;
                const endedAt = Math.floor(NOW_MS / 1000) - 60;
                return {
                    ...status,
                    ownRecovery: {
                        running: false,
                        paused: false,
                        waiting: null,
                        done: 0,
                        total: 0,
                        delivered: 0,
                        failed: 0,
                        queued: [],
                        etaSecs: 0,
                        accounts: status.ownRecovery?.accounts ?? [],
                        outcome: "incomplete",
                        error: NETWORK_ERROR,
                        steps: [],
                    },
                    lastRun: { endedAt, delivered: 0, left: 0, outcome: "incomplete" },
                };
            },
        },
    }),
};

function outage(id: string, respond: Respond, options: ScenarioOptions, extra: readonly Module[] = []): Scenario {
    return defineScenario({
        id,
        identity: IDENTITY,
        now: NOW_MS,
        seed: SEED,
        modules: [
            outageModule(respond),
            shellModule(options),
            supportModule(options),
            serverPickerModule,
            progressModule,
            withoutGameData(matchDetailModule(options)),
            upkeepModule,
            adminAccessModule(),
            buildsModule,
            ...extra,
        ],
    });
}

/**
 * The established player of the default scenario with no route to the Deadlock API: every request to it fails
 * as a dropped connection does. Everything the app keeps on the PC still answers.
 */
export function offlineScenario(options: ScenarioOptions): Scenario {
    return outage("offline", dropped, options);
}

/** As `offline`, but the Deadlock API is reachable and answers every request with a 503. */
export function apiDownScenario(options: ScenarioOptions): Scenario {
    return outage("api-down", unavailable, options);
}

/**
 * As `offline`, but the Deadlock API is reachable and answers every request with a 429 and the headers and
 * body the real API sends. The commands that call it from Rust fail or end incomplete to match.
 */
export function rateLimitedScenario(options: ScenarioOptions): Scenario {
    return outage("rate-limited", rateLimited, options, [rateLimitedCommandsModule]);
}
