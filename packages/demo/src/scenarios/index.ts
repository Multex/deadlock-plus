import type { Scenario } from "../scenario";
import { defaultScenario, postMatchScenario, recoveryScenario, type ScenarioOptions } from "./default";
import { RECOVERY_PRESETS } from "./default/recovery";
import { liveMatchScenario } from "./live-match";
import { newUserScenario } from "./new-user";
import { apiDownScenario, offlineScenario } from "./offline";
import { unelevatedGameAdminScenario, unelevatedScenario } from "./unelevated";
import { updateAvailableScenario } from "./update-available";

export type { ScenarioOptions };
export type ScenarioFactory = (options: ScenarioOptions) => Scenario;

const RECOVERY_SCENARIO_IDS = Object.keys(RECOVERY_PRESETS).filter((id) => id !== "default");

/** Every built-in scenario, by id. */
export const scenarios: Record<string, ScenarioFactory> = {
    default: defaultScenario,
    "new-user": newUserScenario,
    "live-match": liveMatchScenario,
    offline: offlineScenario,
    "api-down": apiDownScenario,
    "update-available": updateAvailableScenario,
    "post-match": postMatchScenario,
    unelevated: unelevatedScenario,
    "unelevated-game-admin": unelevatedGameAdminScenario,
    ...Object.fromEntries(
        RECOVERY_SCENARIO_IDS.map((id): [string, ScenarioFactory] => [id, (options) => recoveryScenario(id, options)]),
    ),
};

/** The factory of scenario `id`. Throws on an id that is not registered. */
export function scenarioFactory(id: string): ScenarioFactory {
    const factory = Object.hasOwn(scenarios, id) ? scenarios[id] : undefined;
    if (!factory) throw new Error(`[demo] unknown scenario "${id}" (known: ${Object.keys(scenarios).join(", ")})`);
    return factory;
}

export interface ScenarioChoice {
    /** Set on the page by a test before it loads. */
    hook?: string | null;
    /** The `demo` query parameter of the first URL. */
    query?: string | null;
    /** The build-time switch; `1` and `true` mean the default scenario. */
    env?: string | null;
}

/** The scenario id to start: the first of hook, query and build value that is set. */
export function selectScenarioId({ hook, query, env }: ScenarioChoice): string {
    const id = hook || query || env;
    return !id || id === "1" || id === "true" ? "default" : id;
}
