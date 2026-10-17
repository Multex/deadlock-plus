import type { MinimapArtResult } from "@deadlock-plus/ipc-types/MinimapArtResult";

import type { Handlers } from "../../backend";
import type { ApiRoute } from "../../fetch";
import { defineScenario, type Module, type Scenario } from "../../scenario";
import type { ScenarioOptions } from "../default";
import { adminAccessModule } from "../default/admin-access";
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

function outage(id: string, respond: Respond, options: ScenarioOptions): Scenario {
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
