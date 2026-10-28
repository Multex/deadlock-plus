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

const RELEASED_BEFORE_MS = 26 * 60 * 60 * 1000;

/** The minor release after `version`. */
export function nextVersion(version: string): string {
    const [major, minor] = version.split(".").map((part) => Number.parseInt(part, 10));
    return `${major}.${(minor ?? 0) + 1}.0`;
}

/**
 * What the backend's `check_update` resolves with when a newer build exists. The frontend wraps it in the updater
 * plugin's `Update` and reads `version`; `rid` names the Rust-side resource a download would use.
 */
interface UpdateMetadata {
    rid: number;
    currentVersion: string;
    version: string;
    date: string;
    body: string;
    rawJson: Record<string, unknown>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A newer build on each channel, so the channel picker can be tried without a network. */
function offeredVersion(channel: unknown, next: string, now: number): string {
    if (channel === "beta") return `${next}-beta.1`;
    if (channel === "nightly")
        return `${next}-nightly.${new Date(now - DAY_MS).toISOString().slice(0, 10).replaceAll("-", "")}`;
    return next;
}

function updaterModule({ appVersion }: ScenarioOptions): Module {
    return {
        name: "updater",
        overrides: ["check_update"],
        create({ now }) {
            const next = nextVersion(appVersion);
            return {
                handlers: {
                    check_update: (args): UpdateMetadata => ({
                        rid: 1,
                        currentVersion: appVersion,
                        version: offeredVersion(args.channel, next, now),
                        date: new Date(now - RELEASED_BEFORE_MS).toISOString(),
                        body: "",
                        rawJson: {},
                    }),
                },
            };
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
            buildsModule,
            updaterModule(options),
        ],
    });
}
