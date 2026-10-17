import type { AutostartStatus } from "@deadlock-plus/ipc-types/AutostartStatus";
import type { DemoListing } from "@deadlock-plus/ipc-types/DemoListing";
import type { GcStatus } from "@deadlock-plus/ipc-types/GcStatus";
import type { IngestStatus } from "@deadlock-plus/ipc-types/IngestStatus";
import type { ServerData } from "@deadlock-plus/ipc-types/ServerData";

import type { Handlers } from "../../backend";
import type { ApiRoute } from "../../fetch";
import { defineScenario, type Module, type ModuleParts, type Scenario } from "../../scenario";
import type { ScenarioOptions } from "../default";
import { adminAccessModule } from "../default/admin-access";
import { IDENTITY, NOW_MS, SEED } from "../default/identity";
import { matchDetailModule } from "../default/match-detail";
import { serverPickerModule } from "../default/server-picker";
import { shellModule } from "../default/shell";
import { supportModule } from "../default/support";
import { upkeepModule } from "../default/upkeep";

const INGEST: IngestStatus = { running: false, steamFound: true, submitted: 0, lastError: null };
const GC: GcStatus = { running: false, accounts: 0, delivered: 0, lastError: null, ownRecovery: null };
const AUTOSTART: AutostartStatus = { supported: true, enabled: false, stale: false };
const UNRANKED = { badge: 0, rank: 0, subrank: 0, last_match: null };

/** What the app's own mute commands answer while Steam has no signed-in account on this PC. */
function noAccount(): never {
    throw { code: "voice_bans.no_account", params: {} };
}

/** `module` with its parts changed after each create, so the change works on that install's own state. */
function adapted(module: Module, change: (parts: ModuleParts) => ModuleParts): Module {
    return { name: module.name, create: (context) => change(module.create(context)) };
}

/**
 * `module` without its saved values, after `empty` has cleared its state through the module's own commands.
 * `empty` returns the handlers that answer differently from then on.
 */
function emptied(module: Module, empty: (handlers: Handlers) => Handlers): Module {
    return adapted(module, ({ handlers = {}, routes }) => ({ handlers: { ...handlers, ...empty(handlers) }, routes }));
}

function unblockEverything(handlers: Handlers): Handlers {
    const data = handlers.fetch_server_groups!({}) as ServerData;
    handlers.unblock_server_groups!({ ids: [...data.unclustered, ...data.clustered].map((group) => group.id) });
    return {};
}

function deleteEveryReplay(handlers: Handlers): Handlers {
    const listing = handlers.list_demos!({}) as DemoListing;
    for (const demo of listing.demos) handlers.set_pinned!({ matchId: demo.matchId, pinned: false });
    handlers.delete_demos!({ fileNames: listing.demos.map((demo) => demo.fileName) });
    handlers.save_cleanup_rules!({ rules: [] });
    return {
        list_demos: (): DemoListing => ({ ...listing, referenceBuild: null, demos: [] }),
        demo_metadata: () => ({ state: "missing" }),
        local_steam_account_ids: () => [],
        read_voice_ban: noAccount,
        write_voice_ban: noAccount,
    };
}

const noHistoryModule: Module = {
    name: "progress",
    create() {
        const routes: ApiRoute[] = [
            [/^\/v1\/players\/\d+\/match-history$/, () => []],
            [/^\/v1\/players\/\d+\/rank$/, () => UNRANKED],
        ];
        return { routes };
    },
};

/**
 * The first launch after installing: the setup has not run, nothing is saved, Steam has no signed-in account on
 * this PC and the game has no replays yet. The game itself is installed and closed.
 */
export function newUserScenario(options: ScenarioOptions): Scenario {
    const shell = adapted(shellModule(options), ({ handlers, routes }) => {
        let autostart = AUTOSTART;
        return {
            routes,
            handlers: {
                ...handlers,
                current_steam_account: () => null,
                list_notifications: () => [],
                ingest_status: () => INGEST,
                gc_status: () => GC,
                autostart_status: () => autostart,
                set_autostart: ({ enabled }) => (autostart = { ...autostart, enabled: enabled === true }),
            },
        };
    });
    return defineScenario({
        id: "new-user",
        identity: IDENTITY,
        now: NOW_MS,
        seed: SEED,
        modules: [
            shell,
            supportModule(options),
            emptied(serverPickerModule, unblockEverything),
            noHistoryModule,
            matchDetailModule(options),
            emptied(upkeepModule, deleteEveryReplay),
            adminAccessModule(),
        ],
    });
}
