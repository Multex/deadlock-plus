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

const RELEASED_BEFORE_MS = 26 * 60 * 60 * 1000;

/** The minor release after `version`. */
export function nextVersion(version: string): string {
    const [major, minor] = version.split(".").map((part) => Number.parseInt(part, 10));
    return `${major}.${(minor ?? 0) + 1}.0`;
}

/**
 * What the updater plugin's `check` resolves with when a newer release exists. The frontend wraps it in an
 * `Update` and reads `version`; `rid` names the Rust-side resource a download would use.
 */
interface UpdateMetadata {
    rid: number;
    currentVersion: string;
    version: string;
    date: string;
    body: string;
    rawJson: Record<string, unknown>;
}

function updaterModule({ appVersion }: ScenarioOptions): Module {
    return {
        name: "updater",
        create({ now }) {
            const update: UpdateMetadata = {
                rid: 1,
                currentVersion: appVersion,
                version: nextVersion(appVersion),
                date: new Date(now - RELEASED_BEFORE_MS).toISOString(),
                body: "",
                rawJson: {},
            };
            return { handlers: { "plugin:updater|check": () => update } };
        },
    };
}

/**
 * The established player of the default scenario on the day after a new release: the update check finds the
 * next minor version. Installing it is not modelled, so a download starts and never ends.
 */
export function updateAvailableScenario(options: ScenarioOptions): Scenario {
    return defineScenario({
        id: "update-available",
        identity: IDENTITY,
        now: NOW_MS,
        seed: SEED,
        modules: [
            shellModule(options),
            supportModule(options),
            serverPickerModule,
            progressModule,
            matchDetailModule(options),
            upkeepModule,
            adminAccessModule(),
            updaterModule(options),
        ],
    });
}
