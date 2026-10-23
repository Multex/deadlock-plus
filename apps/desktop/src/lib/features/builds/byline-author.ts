import { t } from "$lib/core/i18n.svelte";
import { hasProfile } from "$lib/core/player-links";
import { textAround } from "$lib/core/text-around";

/** A row's "By {name}" with the name as a control that filters the list to the author's builds. */
export interface BylineAuthor {
    accountId: number;
    name: string;
    /** The translated text before and after the name. */
    before: string;
    after: string;
    pick: () => void;
}

export type BylinePart = string | BylineAuthor;

export function bylineAuthor(accountId: number, name: string | undefined, pick: () => void): BylinePart | null {
    if (!name) return null;
    if (!hasProfile(accountId)) return t("builds.browser.by", { name });
    const [before, after] = textAround((n) => t("builds.browser.by", { name: n }));
    return { accountId, name, before, after, pick };
}
