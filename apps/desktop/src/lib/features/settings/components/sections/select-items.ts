import type { SelectMenuItem } from "@deadlock-plus/ui/select-menu";

export function weekdayItems(days: string[]): SelectMenuItem[] {
    return days.map((label, i) => ({ value: String(i), label }));
}

export function leadItems(
    options: number[],
    labels: { minutes: (minutes: number) => string; hours: (hours: number) => string },
): SelectMenuItem[] {
    return options.map((m) => ({ value: String(m), label: m >= 60 ? labels.hours(m / 60) : labels.minutes(m) }));
}
