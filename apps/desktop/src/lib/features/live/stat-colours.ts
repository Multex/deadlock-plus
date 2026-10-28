import { readableColour } from "@deadlock-plus/ui/accent";
import type { Theme } from "@deadlock-plus/ui/themes";

/** The Live table's stat colours, tuned on the dark themes. */
export const STAT_COLOURS = {
    souls: "oklch(0.86 0.14 98)",
    spm: "oklch(0.76 0.08 98)",
    k: "oklch(0.82 0.12 195)",
    d: "oklch(0.68 0.19 25)",
    a: "oklch(0.8 0.12 340)",
    r: "oklch(0.8 0.05 240)",
    hd: "oklch(0.76 0.15 55)",
    od: "oklch(0.74 0.12 270)",
    hl: "oklch(0.78 0.16 150)",
} as const;

export type StatColour = keyof typeof STAT_COLOURS;

/** Dark themes draw the colours as tuned; on a light theme each only darkens, hue kept, until it reads at 4.5:1. */
export function statColours(theme: Theme): Record<StatColour, string> {
    const entries = Object.entries(STAT_COLOURS).map(([name, colour]) => [
        name,
        theme.light ? readableColour(theme, colour) : colour,
    ]);
    return Object.fromEntries(entries) as Record<StatColour, string>;
}

export function statColourStyle(theme: Theme): string {
    return Object.entries(statColours(theme))
        .map(([name, colour]) => `--c-${name}: ${colour};`)
        .join("");
}
