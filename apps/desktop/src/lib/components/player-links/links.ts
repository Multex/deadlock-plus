import { ChartNoAxesColumn, Hammer, User } from "@lucide/svelte";
import { t } from "$lib/core/i18n.svelte";
import { hasProfile, openProfile, type ProfileSite } from "$lib/core/player-links";

export type LinkIcon = typeof User;

export interface ProfileLink {
    site: ProfileSite;
    /** Menu item text, e.g. "Steam profile". */
    text: string;
    /** Accessible name that carries the player's name, for icon buttons. */
    label: string;
    icon: LinkIcon;
    open: () => Promise<void>;
}

/** A surface action listed above the profile links in the name menu, e.g. "Builds by {name}". */
export interface LeadingItem {
    label: string;
    icon?: LinkIcon;
    onSelect: () => void;
}

export const DEFAULT_SITES: readonly ProfileSite[] = ["steam", "statlocker"];

const ICONS: Record<ProfileSite, LinkIcon> = {
    steam: User,
    statlocker: ChartNoAxesColumn,
    buildlocker: Hammer,
};

export function profileLinks(
    name: string,
    accountId: number | null | undefined,
    sites: readonly ProfileSite[] = DEFAULT_SITES,
): ProfileLink[] {
    if (!hasProfile(accountId)) return [];
    return sites.map((site) => ({
        site,
        text: t(`player_links.${site}`),
        label: t(`player_links.${site}_of`, { name }),
        icon: ICONS[site],
        open: () => openProfile(site, accountId),
    }));
}
