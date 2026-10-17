import type { AdminAccessOutcome } from "@deadlock-plus/ipc-types/AdminAccessOutcome";
import type { AdminAccessStatus } from "@deadlock-plus/ipc-types/AdminAccessStatus";
import { afterEach, describe, expect, it } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { defaultScenario } from "./index";
import { adminAccessModule, type AdminAccessOptions } from "./admin-access";
import { defineScenario } from "../../scenario";
import { IDENTITY, NOW_MS, SEED } from "./identity";

const OPTIONS = { appVersion: "1.2.3", changelog: "# Changelog\n", mapItemsTsv: "" };
const UNELEVATED: AdminAccessStatus = {
    elevated: false,
    route: "needsPermission",
    canPrompt: true,
    gameRunsAsAdmin: false,
};

describe("admin access module", () => {
    let handle: DemoHandle | undefined;
    afterEach(() => handle?.uninstall());

    const start = (options?: AdminAccessOptions) => {
        handle = install(
            defineScenario({
                id: "t",
                identity: IDENTITY,
                now: NOW_MS,
                seed: SEED,
                modules: [adminAccessModule(options)],
            }),
        );
        return handle;
    };
    const status = () => handle!.invoke("admin_access_status", {}) as AdminAccessStatus;

    it("is elevated in the default scenario", () => {
        handle = install(defaultScenario(OPTIONS));
        expect(status()).toEqual({ elevated: true, route: "inProcess", canPrompt: false, gameRunsAsAdmin: false });
    });

    it("refuses to allow or remove while elevated", () => {
        start();
        expect(() => handle!.invoke("allow_admin_access", { always: false })).toThrow(
            expect.objectContaining({ code: "admin_access.already_elevated" }),
        );
        expect(() => handle!.invoke("remove_admin_access", {})).toThrow(
            expect.objectContaining({ code: "admin_access.already_elevated" }),
        );
    });

    it("refuses while a match runs", () => {
        start({ status: { ...UNELEVATED, canPrompt: false } });
        expect(() => handle!.invoke("allow_admin_access", { always: true })).toThrow(
            expect.objectContaining({ code: "admin_access.in_match" }),
        );
    });

    it("routes through the helper for one session, the service for always, and back on remove", () => {
        start({ status: UNELEVATED });
        expect(handle!.invoke("allow_admin_access", { always: false })).toEqual({ status: "applied" });
        expect(status().route).toBe("helper");
        expect(handle!.invoke("allow_admin_access", { always: true })).toEqual({ status: "applied" });
        expect(status().route).toBe("service");
        handle!.invoke("remove_admin_access", {});
        expect(status().route).toBe("needsPermission");
    });

    it("leaves the route alone on cancel and failure", () => {
        const failed: AdminAccessOutcome = {
            status: "failed",
            error: { code: "admin_access.install_failed", params: {} },
        };
        start({ status: UNELEVATED, allow: { status: "cancelled" } });
        expect(handle!.invoke("allow_admin_access", { always: true })).toEqual({ status: "cancelled" });
        expect(status().route).toBe("needsPermission");
        handle!.uninstall();
        start({ status: UNELEVATED, allow: failed });
        expect(handle!.invoke("allow_admin_access", { always: true })).toEqual(failed);
        expect(status().route).toBe("needsPermission");
    });
});
