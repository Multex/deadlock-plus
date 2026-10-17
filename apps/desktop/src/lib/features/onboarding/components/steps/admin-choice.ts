import type { AdminAllowResult } from "$lib/features/admin-access/admin-access.svelte";

/** `session`: Always allow failed, but the helper it started serves this session. */
export type AdminChoice =
    | { kind: "none" }
    | { kind: "later" }
    | { kind: "waiting" }
    | { kind: "applied" }
    | { kind: "session"; message: string }
    | { kind: "cancelled"; message: string }
    | { kind: "failed"; message: string };

export function afterAlways({ kind, retry, message }: AdminAllowResult): AdminChoice {
    if (kind === "cancelled") return { kind: "cancelled", message: message ?? "" };
    if (retry) return message === null ? { kind: "applied" } : { kind: "session", message };
    return { kind: "failed", message: message ?? "" };
}

export interface CardState {
    pressed: boolean;
    disabled: boolean;
}

export interface ChoiceView {
    always: CardState;
    later: CardState;
    notice: { tone: "success" | "neutral" | "warning"; text: string } | null;
}

export function choiceView(
    choice: AdminChoice,
    { alwaysOn, afterMatch, appliedText }: { alwaysOn: boolean; afterMatch: boolean; appliedText: string },
): ChoiceView {
    if (alwaysOn || choice.kind === "applied") {
        return {
            always: { pressed: true, disabled: false },
            later: { pressed: false, disabled: true },
            notice: { tone: "success", text: appliedText },
        };
    }
    if (choice.kind === "waiting") {
        return { always: { pressed: true, disabled: false }, later: { pressed: false, disabled: true }, notice: null };
    }
    const notice =
        choice.kind === "cancelled"
            ? { tone: "neutral" as const, text: choice.message }
            : choice.kind === "failed" || choice.kind === "session"
              ? { tone: "warning" as const, text: choice.message }
              : null;
    return {
        always: { pressed: false, disabled: afterMatch || choice.kind === "session" },
        later: { pressed: choice.kind === "later", disabled: false },
        notice,
    };
}
