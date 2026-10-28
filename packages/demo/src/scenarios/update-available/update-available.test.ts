import { afterEach, describe, expect, it } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { defaultScenario } from "../default";
import { nextVersion, updateAvailableScenario } from "./index";

const OPTIONS = { appVersion: "1.2.3", changelog: "# Changelog\n", mapItemsTsv: "" };
const CHECK = "check_update";

describe("update-available scenario", () => {
    const handles: DemoHandle[] = [];
    const start = (scenario = updateAvailableScenario(OPTIONS)) => {
        const handle = install(scenario);
        handles.push(handle);
        return handle;
    };
    afterEach(() => {
        while (handles.length) handles.pop()!.uninstall();
    });

    it("names the minor version after the running one", () => {
        expect(nextVersion("1.2.3")).toBe("1.3.0");
        expect(nextVersion("0.11.0")).toBe("0.12.0");
        expect(nextVersion("2.9.4-beta.1")).toBe("2.10.0");
    });

    it("answers the update check with a newer release, in the shape the plugin's Update is built from", () => {
        const handle = start();
        expect(updateAvailableScenario(OPTIONS).id).toBe("update-available");
        const update = handle.invoke(CHECK, { channel: "release" }) as Record<string, unknown>;
        expect(update).toMatchObject({ currentVersion: "1.2.3", version: "1.3.0" });
        expect(Object.keys(update).sort()).toEqual(["body", "currentVersion", "date", "rawJson", "rid", "version"]);
        expect(update.rid).toEqual(expect.any(Number));
        expect(Number.isNaN(Date.parse(String(update.date)))).toBe(false);
        expect(Date.parse(String(update.date))).toBeLessThan(updateAvailableScenario(OPTIONS).now);
    });

    it("offers each channel its own kind of build, with no network", () => {
        const handle = start();
        const version = (channel: string) => (handle.invoke(CHECK, { channel }) as { version: string }).version;
        expect(version("release")).toBe("1.3.0");
        expect(version("beta")).toBe("1.3.0-beta.1");
        expect(version("nightly")).toMatch(/^1\.3\.0-nightly\.\d{8}$/);
    });

    it("differs from the default scenario only in that answer", () => {
        const handle = start();
        for (const channel of ["release", "beta", "nightly"])
            expect(start(defaultScenario(OPTIONS)).invoke(CHECK, { channel })).toBeNull();
        expect(handle.invoke("app_info", {})).toMatchObject({ appVersion: "1.2.3", debugBuild: false });
        expect(handle.invoke("plugin:updater|download_and_install", { rid: 1 })).toBeNull();
        expect(handle.unhandled()).toEqual([]);
    });
});
