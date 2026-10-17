import { describe, expect, it } from "vitest";
import { afterAlways, choiceView, type AdminChoice } from "./admin-choice";

const NOTHING_CHANGED = "Nothing changed.";
const APPLIED = "Always allow is on.";
const NONE: AdminChoice = { kind: "none" };

const view = (choice: AdminChoice, over: Partial<Parameters<typeof choiceView>[1]> = {}) =>
    choiceView(choice, { alwaysOn: false, afterMatch: false, appliedText: APPLIED, ...over });

describe("afterAlways", () => {
    it("is applied when the outcome asks for a re-run and says nothing", () => {
        expect(afterAlways({ kind: "applied", retry: true, message: null })).toEqual({ kind: "applied" });
    });

    it("keeps the session allowed when Always allow failed but the helper still runs", () => {
        expect(afterAlways({ kind: "failed", retry: true, message: "Blocked." })).toEqual({
            kind: "session",
            message: "Blocked.",
        });
    });

    it("is cancelled when Windows' prompt was closed", () => {
        expect(afterAlways({ kind: "cancelled", retry: false, message: NOTHING_CHANGED })).toEqual({
            kind: "cancelled",
            message: NOTHING_CHANGED,
        });
    });

    it("is failed for a failure, even one whose text matches the cancel text", () => {
        expect(afterAlways({ kind: "failed", retry: false, message: NOTHING_CHANGED })).toEqual({
            kind: "failed",
            message: NOTHING_CHANGED,
        });
    });
});

describe("choiceView", () => {
    it("presses neither card before the user picks", () => {
        expect(view(NONE)).toEqual({
            always: { pressed: false, disabled: false },
            later: { pressed: false, disabled: false },
            notice: null,
        });
    });

    it("lights Always allow, greys out Ask me later and says so once applied", () => {
        expect(view({ kind: "applied" })).toEqual({
            always: { pressed: true, disabled: false },
            later: { pressed: false, disabled: true },
            notice: { tone: "success", text: APPLIED },
        });
    });

    it("shows the applied state when the route is already the service, whatever was picked", () => {
        for (const choice of [NONE, { kind: "later" } as const]) {
            expect(view(choice, { alwaysOn: true })).toEqual(view({ kind: "applied" }));
        }
    });

    it("presses Always allow and greys out the other while Windows asks", () => {
        expect(view({ kind: "waiting" })).toEqual({
            always: { pressed: true, disabled: false },
            later: { pressed: false, disabled: true },
            notice: null,
        });
    });

    it("presses Ask me later without a notice", () => {
        expect(view({ kind: "later" })).toEqual({
            always: { pressed: false, disabled: false },
            later: { pressed: true, disabled: false },
            notice: null,
        });
    });

    it("shows a cancel as a neutral notice and leaves both cards open", () => {
        expect(view({ kind: "cancelled", message: NOTHING_CHANGED })).toEqual({
            always: { pressed: false, disabled: false },
            later: { pressed: false, disabled: false },
            notice: { tone: "neutral", text: NOTHING_CHANGED },
        });
    });

    it("shows a failure as a warning and leaves both cards open", () => {
        expect(view({ kind: "failed", message: "Couldn't." })).toEqual({
            always: { pressed: false, disabled: false },
            later: { pressed: false, disabled: false },
            notice: { tone: "warning", text: "Couldn't." },
        });
    });

    it("warns and closes Always allow when it can't work but this session is allowed", () => {
        expect(view({ kind: "session", message: "Blocked." })).toEqual({
            always: { pressed: false, disabled: true },
            later: { pressed: false, disabled: false },
            notice: { tone: "warning", text: "Blocked." },
        });
    });

    it("closes Always allow during a match", () => {
        expect(view(NONE, { afterMatch: true }).always).toEqual({ pressed: false, disabled: true });
        expect(view(NONE, { afterMatch: true }).later).toEqual({ pressed: false, disabled: false });
    });
});
