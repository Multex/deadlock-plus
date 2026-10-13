import type { SelectMenuItem } from "@deadlock-plus/ui/select-menu";

export function runItems(
    runs: readonly { id: string; label: string; savedAt: number }[],
    pickLabel: string,
    date: (at: number) => string,
): SelectMenuItem[] {
    return [
        { value: "", label: pickLabel },
        ...runs.map((r) => ({ value: r.id, label: r.label, meta: date(r.savedAt) })),
    ];
}
