import { defineScenario, type Scenario } from "../../scenario";
import type { ApiRoute } from "../../fetch";
import { adminAccessModule, type AdminAccessOptions } from "./admin-access";
import { IDENTITY, NOW_MS, SEED } from "./identity";
import { matchDetailModule, type MatchDetailOptions } from "./match-detail";
import { RECOVERY_PRESETS, showsRecovery, spreadStartTimes, type RecoverySession } from "./recovery";
import { historyRows, progressModule } from "./progress";
import { serverPickerModule } from "./server-picker";
import { shellModule, type ShellOptions } from "./shell";
import { supportModule } from "./support";
import { upkeepModule } from "./upkeep";

/** What a scenario needs from the app it runs in. These live outside the package, so the app hands them over. */
export type ScenarioOptions = ShellOptions & MatchDetailOptions & { adminAccess?: AdminAccessOptions };

/** An established player on a quiet evening: the game is closed, three weeks of matches are on record. */
export function defaultScenario(options: ScenarioOptions): Scenario {
    return scenarioNamed("default", options);
}

/** The default scenario seen through one of the recovery presets, such as `recovery-running`. */
export function recoveryScenario(id: string, options: ScenarioOptions): Scenario {
    const recovery = RECOVERY_PRESETS[id];
    if (!recovery) throw new Error(`[demo] no recovery preset "${id}"`);
    const scenario = scenarioNamed(id, { ...options, recovery });
    if (!showsRecovery(recovery)) return scenario;
    const rows = spreadStartTimes(
        historyRows({ identity: IDENTITY, now: NOW_MS, seed: SEED }),
        Math.floor(NOW_MS / 1000),
    );
    const history: ApiRoute = [
        /^\/v1\/players\/\d+\/match-history$/,
        (url) => (Number(url.pathname.split("/")[3]) === IDENTITY.accountId ? rows : []),
    ];
    return scenario.with({ routes: [history] });
}

function scenarioNamed(id: string, base: ScenarioOptions): Scenario {
    const options = { ...base, recoverySession: {} as RecoverySession };
    return defineScenario({
        id,
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
            adminAccessModule(options.adminAccess),
        ],
    });
}
