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
