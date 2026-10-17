import { describe, expect, it } from "vitest";
import type { AppError } from "@deadlock-plus/ipc-types/AppError";
import { outcomeView } from "./outcome";

const failed = (code: string): { status: "failed"; error: AppError } => ({
    status: "failed",
    error: { code, params: {} },
});

describe("outcomeView", () => {
    it("re-runs the action after access was applied, saying nothing", () => {
        expect(outcomeView({ status: "applied" })).toEqual({ retry: true, notice: null });
    });

    it("says nothing changed when the prompt was cancelled, without re-running", () => {
        expect(outcomeView({ status: "cancelled" })).toEqual({ retry: false, notice: { kind: "nothing_changed" } });
    });

    for (const code of ["admin_access.always_allow_blocked", "admin_access.always_allow_needs_install"]) {
        it(`shows ${code} and still re-runs, since this session is allowed`, () => {
            const outcome = failed(code);
            expect(outcomeView(outcome)).toEqual({ retry: true, notice: { kind: "error", error: outcome.error } });
        });
    }

    it("shows any other failure without re-running", () => {
        const outcome = failed("admin_access.allow_failed");
        expect(outcomeView(outcome)).toEqual({ retry: false, notice: { kind: "error", error: outcome.error } });
    });
});
