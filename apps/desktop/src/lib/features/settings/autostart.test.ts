import { describe, expect, it } from "vitest";
import catalog from "../../../../../../locales/en.json";
import { t } from "$lib/core/i18n.svelte";
import { autostartDescription, autostartLine, autostartTitle } from "./autostart";

describe("autostartLine", () => {
    it("is empty when off or still loading", () => {
        expect(autostartLine(null, null)).toBe("");
        expect(autostartLine({ supported: true, enabled: false, stale: false }, null)).toBe("");
    });

    it("says nothing about a healthy setup", () => {
        expect(autostartLine({ supported: true, enabled: true, stale: false }, null)).toBe("");
    });

    it("warns when the task points at another copy", () => {
        expect(autostartLine({ supported: true, enabled: true, stale: true }, null)).toContain(
            "different copy of Deadlock+",
        );
    });

    it("shows one failure sentence over any status", () => {
        const failure = { code: "autostart.task_create_failed", params: {} };
        expect(autostartLine({ supported: true, enabled: true, stale: true }, failure)).toBe(
            t("settings.autostart.failed"),
        );
    });

    it("shows a failure that names its cause on its own", () => {
        const failure = { code: "autostart.user_name_unavailable", params: {} };
        expect(autostartLine(null, failure)).toBe(catalog.errors.autostart.user_name_unavailable);
    });
});

describe("autostart copy", () => {
    it("names the toggle after the system", () => {
        expect(autostartTitle("windows")).toBe("Start with Windows");
        expect(autostartTitle("macos")).toBe("Start with macOS");
        expect(autostartTitle("linux")).toBe("Start at login");
    });

    it("describes when it launches without naming the wrong system", () => {
        expect(autostartDescription("windows")).toBe("Launches Deadlock+ when you sign in to Windows.");
        expect(autostartDescription("macos")).toBe("Launches Deadlock+ when you log in to macOS.");
        expect(autostartDescription("linux")).toBe("Launches Deadlock+ when you log in to your desktop.");
    });
});
