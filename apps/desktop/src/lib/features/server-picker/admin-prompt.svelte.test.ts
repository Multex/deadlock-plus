import { describe, expect, it, vi } from "vitest";
import type { AdminAllowResult } from "$lib/features/admin-access/admin-access.svelte";
import type { AdminButtons } from "$lib/features/admin-access/buttons";
import { AdminPrompt } from "./admin-prompt.svelte";

const NEEDS_PERMISSION = { code: "server_picker.needs_permission", params: {} };
const PROMPT: AdminButtons = { kind: "prompt", allow: true, disabled: null };

function setup(
    buttons: AdminButtons = PROMPT,
    result: AdminAllowResult = { kind: "applied", retry: true, message: null },
) {
    const notify = vi.fn();
    const allow = vi.fn(async (_always: boolean) => result);
    const prompt = new AdminPrompt({ access: { buttons, allow }, notify });
    const retry = vi.fn(async () => {});
    const failure = { title: "Couldn't block Amsterdam.", fallback: "Couldn't block Amsterdam. Check the log.", retry };
    return { prompt, notify, allow, retry, failure };
}

describe("AdminPrompt.failed", () => {
    it("asks for administrator access when the firewall write needs it and Allow can be offered", () => {
        const { prompt, notify, failure } = setup();

        prompt.failed(NEEDS_PERMISSION, failure);

        expect(prompt.pending?.title).toBe("Couldn't block Amsterdam.");
        expect(notify).not.toHaveBeenCalled();
    });

    it("asks during a match too, so the dialog can say when it becomes available", () => {
        const { prompt, failure } = setup({ kind: "prompt", allow: true, disabled: "after_match" });

        prompt.failed(NEEDS_PERMISSION, failure);

        expect(prompt.pending).not.toBeNull();
    });

    it.each<[string, AdminButtons]>([
        ["hidden", { kind: "hidden" }],
        ["remove", { kind: "remove" }],
    ])("shows the failure toast when the buttons are %s", (_, buttons) => {
        const { prompt, notify, failure } = setup(buttons);

        prompt.failed(NEEDS_PERMISSION, failure);

        expect(prompt.pending).toBeNull();
        expect(notify).toHaveBeenCalledOnce();
    });

    it("shows the failure toast for any other error", () => {
        const { prompt, notify, failure } = setup();

        prompt.failed(new Error("the firewall refused"), failure);

        expect(prompt.pending).toBeNull();
        expect(notify).toHaveBeenCalledWith("Couldn't block Amsterdam. Check the log.", "error");
    });
});

describe("AdminPrompt.allow", () => {
    it("runs the failed write again once access is allowed, and closes", async () => {
        const { prompt, allow, retry, notify, failure } = setup();
        prompt.failed(NEEDS_PERMISSION, failure);

        await prompt.allow(true);

        expect(allow).toHaveBeenCalledWith(true);
        expect(retry).toHaveBeenCalledOnce();
        expect(prompt.pending).toBeNull();
        expect(notify).not.toHaveBeenCalled();
    });

    it("says what happened and does not run again when access was not given", async () => {
        const { prompt, retry, notify, failure } = setup(PROMPT, {
            kind: "cancelled",
            retry: false,
            message: "Nothing changed.",
        });
        prompt.failed(NEEDS_PERMISSION, failure);

        await prompt.allow(false);

        expect(notify).toHaveBeenCalledWith("Nothing changed.", "info");
        expect(retry).not.toHaveBeenCalled();
        expect(prompt.pending).toBeNull();
    });

    it("says what happened and still runs again when this session is allowed anyway", async () => {
        const { prompt, retry, notify, failure } = setup(PROMPT, {
            kind: "failed",
            retry: true,
            message: "Always allow didn't work.",
        });
        prompt.failed(NEEDS_PERMISSION, failure);

        await prompt.allow(true);

        expect(notify).toHaveBeenCalledWith("Always allow didn't work.", "warning");
        expect(retry).toHaveBeenCalledOnce();
    });

    it("shows a failure without a re-run as an error", async () => {
        const { prompt, notify, failure } = setup(PROMPT, { kind: "failed", retry: false, message: "Couldn't." });
        prompt.failed(NEEDS_PERMISSION, failure);

        await prompt.allow(true);

        expect(notify).toHaveBeenCalledWith("Couldn't.", "error");
    });

    it("does nothing when nothing is waiting", async () => {
        const { prompt, allow } = setup();

        await prompt.allow(true);

        expect(allow).not.toHaveBeenCalled();
    });
});

describe("AdminPrompt.dismiss", () => {
    it("closes without asking or running anything", () => {
        const { prompt, allow, retry, notify, failure } = setup();
        prompt.failed(NEEDS_PERMISSION, failure);

        prompt.dismiss();

        expect(prompt.pending).toBeNull();
        expect(allow).not.toHaveBeenCalled();
        expect(retry).not.toHaveBeenCalled();
        expect(notify).not.toHaveBeenCalled();
    });
});
