/**
 * The paper is an object lying on the table, so its colours stay the same on every app theme.
 * `paper-edge` is the darkest the aged edge gets; `highlight` is the viewer's row.
 */
export const PAPER_TOKENS = {
    paper: "oklch(0.9201 0.0267 87.86)",
    "paper-edge": "oklch(0.8524 0.0407 84.57)",
    highlight: "oklch(0.8593 0.0365 61.88)",
    ink: "oklch(0.2194 0.0105 80.57)",
    "ink-soft": "oklch(0.3872 0.0224 77.96)",
    spot: "oklch(0.4734 0.1613 29.82)",
    "hk-ink": "oklch(0.45 0.095 74.12)",
    "am-ink": "oklch(0.4099 0.1011 257.1)",
    "lane-yellow": "oklch(0.6035 0.1237 84.92)",
    "lane-blue": "oklch(0.5052 0.0822 221.51)",
    "lane-green": "oklch(0.5209 0.1257 140.02)",
} as const;

export type PaperToken = keyof typeof PAPER_TOKENS;

const INKS: PaperToken[] = ["ink", "ink-soft", "spot", "hk-ink", "am-ink"];

/** [text, background]: every ink on every paper tone, plus paper-coloured text on the solid blocks. */
export const PAPER_TEXT_PAIRS: [PaperToken, PaperToken][] = [
    ...(["paper", "paper-edge", "highlight"] as const).flatMap((bg) =>
        INKS.map((fg): [PaperToken, PaperToken] => [fg, bg]),
    ),
    ["paper", "ink"],
    ["paper", "spot"],
    ["paper", "hk-ink"],
    ["paper", "am-ink"],
];

/** The tokens as `--fp-*` custom properties, for the sheet's `style`. */
export const PAPER_STYLE = Object.entries(PAPER_TOKENS)
    .map(([name, value]) => `--fp-${name}: ${value}`)
    .join("; ");
