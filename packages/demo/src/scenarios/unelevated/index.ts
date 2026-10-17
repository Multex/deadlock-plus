import type { Scenario } from "../../scenario";
import { defaultScenario, type ScenarioOptions } from "../default";

/** The default scenario's player, running the app without administrator rights and able to allow it. */
export function unelevatedScenario(options: ScenarioOptions): Scenario {
    const scenario = defaultScenario({
        ...options,
        adminAccess: {
            status: { elevated: false, route: "needsPermission", canPrompt: true, gameRunsAsAdmin: false },
            ...options.adminAccess,
        },
    });
    return { ...scenario, id: "unelevated" };
}

/** The unelevated player whose Deadlock runs as administrator, so the app cannot read it. */
export function unelevatedGameAdminScenario(options: ScenarioOptions): Scenario {
    const scenario = unelevatedScenario({
        ...options,
        adminAccess: {
            status: { elevated: false, route: "needsPermission", canPrompt: true, gameRunsAsAdmin: true },
            ...options.adminAccess,
        },
    });
    return { ...scenario, id: "unelevated-game-admin" };
}
