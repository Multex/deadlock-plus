import { defineScenario, type Scenario } from "../../scenario";
import { IDENTITY, NOW_MS, SEED } from "./identity";
import { matchDetailModule, type MatchDetailOptions } from "./match-detail";
import { progressModule } from "./progress";
import { serverPickerModule } from "./server-picker";
import { shellModule, type ShellOptions } from "./shell";
import { supportModule } from "./support";
import { upkeepModule } from "./upkeep";

/** What a scenario needs from the app it runs in. These live outside the package, so the app hands them over. */
export type ScenarioOptions = ShellOptions & MatchDetailOptions;

/** An established player on a quiet evening: the game is closed, three weeks of matches are on record. */
export function defaultScenario(options: ScenarioOptions): Scenario {
    return defineScenario({
        id: "default",
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
        ],
    });
}
