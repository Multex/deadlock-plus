export const WHATS_NEW_LAYOUTS = ["reveal", "spread", "patch"] as const;

export type WhatsNewLayout = (typeof WHATS_NEW_LAYOUTS)[number];

/** Demo builds only: `?layout=` picks one of the candidate What's New designs, so each can be screenshotted. */
export function previewLayout(params: URLSearchParams, demo: boolean): WhatsNewLayout | null {
    if (!demo) return null;
    const value = params.get("layout");
    return WHATS_NEW_LAYOUTS.find((l) => l === value) ?? null;
}

/** The version a demo preview gives the changelog's Unreleased section. */
export const PREVIEW_VERSION = "0.15.0";
