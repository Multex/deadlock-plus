import { describe, expect, it } from "vitest";
import type { AdminAccessStatus } from "@deadlock-plus/ipc-types/AdminAccessStatus";
import type { AdminRoute } from "@deadlock-plus/ipc-types/AdminRoute";
import { buttons } from "./buttons";

const routes: AdminRoute[] = ["inProcess", "service", "helper", "needsPermission"];

function status(route: AdminRoute, elevated: boolean, canPrompt: boolean): AdminAccessStatus {
    return { elevated, route, canPrompt, gameRunsAsAdmin: false };
}

describe("buttons", () => {
    for (const route of routes) {
        for (const elevated of [true, false]) {
            for (const canPrompt of [true, false]) {
                const label = `${route} elevated=${elevated} canPrompt=${canPrompt}`;
                it(label, () => {
                    const result = buttons(status(route, elevated, canPrompt));
                    if (elevated || route === "inProcess") {
                        expect(result).toEqual({ kind: "hidden" });
                    } else if (route === "service") {
                        expect(result).toEqual({ kind: "remove" });
                    } else {
                        expect(result).toEqual({
                            kind: "prompt",
                            allow: route === "needsPermission",
                            disabled: canPrompt ? null : "after_match",
                        });
                    }
                });
            }
        }
    }
});
