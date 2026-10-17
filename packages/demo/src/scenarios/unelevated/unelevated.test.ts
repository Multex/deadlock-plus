import { afterEach, expect, it } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { unelevatedScenario } from "./index";

const OPTIONS = { appVersion: "1.2.3", changelog: "# Changelog\n", mapItemsTsv: "" };

let handle: DemoHandle | undefined;
afterEach(() => handle?.uninstall());

it("runs without administrator rights until allowed", () => {
    handle = install(unelevatedScenario(OPTIONS));
    expect(handle.scenario).toBe("unelevated");
    expect(handle.invoke("admin_access_status", {})).toEqual({
        elevated: false,
        route: "needsPermission",
        canPrompt: true,
        gameRunsAsAdmin: false,
    });
    expect(handle.invoke("allow_admin_access", { always: false })).toEqual({ status: "applied" });
});
