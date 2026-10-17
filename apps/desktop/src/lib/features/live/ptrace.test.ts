import { describe, expect, it } from "vitest";
import { ptraceNotice } from "./ptrace";

describe("ptraceNotice", () => {
    it("shows nothing off Linux or while the attach is not refused", () => {
        expect(ptraceNotice({ denied: true, fix: "sysctl" }, "windows", false)).toBeNull();
        expect(ptraceNotice({ denied: false, fix: null }, "linux", false)).toBeNull();
        expect(ptraceNotice(null, "linux", false)).toBeNull();
    });

    it("offers the restart button for setcap", () => {
        expect(ptraceNotice({ denied: true, fix: "setcap" }, "linux", false)).toEqual({
            action: "live.ptrace.fix_restart",
            note: null,
        });
    });

    it("offers the plain fix for the sysctl drop-in", () => {
        expect(ptraceNotice({ denied: true, fix: "sysctl" }, "linux", false)).toEqual({
            action: "live.ptrace.fix",
            note: null,
        });
    });

    it("says a reboot is needed for scope 3, and drops the button once applied", () => {
        expect(ptraceNotice({ denied: true, fix: "sysctlAfterReboot" }, "linux", false)).toEqual({
            action: "live.ptrace.fix",
            note: "live.ptrace.reboot",
        });
        expect(ptraceNotice({ denied: true, fix: "sysctlAfterReboot" }, "linux", true)).toEqual({
            action: null,
            note: "live.ptrace.reboot",
        });
    });

    it("explains the cause when no one-click fix can help", () => {
        expect(ptraceNotice({ denied: true, fix: null }, "linux", false)).toEqual({
            action: null,
            note: "live.ptrace.manual",
        });
    });
});
