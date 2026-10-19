import type { Component } from "svelte";
import { Bell, Bug, HardDrive, Info, Languages, Layers, Palette, Power, Share2, Shield } from "@lucide/svelte";
import { platform, type Platform } from "$lib/core/platform";
import { t } from "$lib/core/i18n.svelte";
import { autostartDescription, autostartTitle } from "./autostart";

export type CategoryId =
    | "appearance"
    | "language"
    | "startup"
    | "notifications"
    | "overlay"
    | "privacy"
    | "sharing"
    | "storage"
    | "diagnostics"
    | "about";

export interface Category {
    id: CategoryId;
    label: string;
    icon: Component<{ class?: string }>;
}

export interface SettingItem {
    id: string;
    category: CategoryId;
    title: string;
    description?: string;
    keywords: string;
}

export const CATEGORIES: Category[] = [
    {
        id: "appearance",
        get label() {
            return t("settings.categories.appearance");
        },
        icon: Palette,
    },
    {
        id: "language",
        get label() {
            return t("settings.categories.language");
        },
        icon: Languages,
    },
    {
        id: "startup",
        get label() {
            return t("settings.categories.startup");
        },
        icon: Power,
    },
    {
        id: "notifications",
        get label() {
            return t("settings.categories.notifications");
        },
        icon: Bell,
    },
    {
        id: "overlay",
        get label() {
            return t("settings.categories.overlay");
        },
        icon: Layers,
    },
    {
        id: "privacy",
        get label() {
            return t("settings.categories.privacy");
        },
        icon: Shield,
    },
    {
        id: "sharing",
        get label() {
            return t("settings.categories.sharing");
        },
        icon: Share2,
    },
    {
        id: "storage",
        get label() {
            return t("settings.categories.storage");
        },
        icon: HardDrive,
    },
    {
        id: "diagnostics",
        get label() {
            return t("settings.categories.diagnostics");
        },
        icon: Bug,
    },
    {
        id: "about",
        get label() {
            return t("settings.categories.about");
        },
        icon: Info,
    },
];

const BASE_ITEMS: SettingItem[] = [
    {
        id: "theme",
        category: "appearance",
        get title() {
            return t("settings.items.theme");
        },
        get description() {
            return t("settings.appearance.theme_description");
        },
        keywords:
            "colour color dark light midnight daylight contrast palette appearance nightshift deadlock api oled black",
    },
    {
        id: "reduced-motion",
        category: "appearance",
        get title() {
            return t("settings.items.reduced_motion");
        },
        get description() {
            return t("settings.appearance.motion_description");
        },
        keywords: "animation animations transitions motion accessibility vestibular system",
    },
    {
        id: "accessible-font",
        category: "appearance",
        get title() {
            return t("settings.items.accessible_font");
        },
        get description() {
            return t("settings.appearance.font_description");
        },
        keywords: "atkinson hyperlegible dyslexia low vision readable text typeface",
    },
    {
        id: "ui-scale",
        category: "appearance",
        get title() {
            return t("settings.items.ui_scale");
        },
        get description() {
            return t("settings.appearance.scale_description");
        },
        keywords: "zoom size text size font size bigger smaller larger dpi magnify interface",
    },
    {
        id: "hardware-acceleration",
        category: "appearance",
        get title() {
            return t("settings.items.hardware_acceleration");
        },
        get description() {
            return t("settings.appearance.hardware_acceleration_description");
        },
        keywords:
            "gpu graphics card performance lag stutter flicker black screen capture obs recording webview2 driver",
    },
    {
        id: "language",
        category: "language",
        get title() {
            return t("settings.language.label");
        },
        get description() {
            return t("settings.language.description");
        },
        keywords: "locale translation translate english system display flag completion crowdin",
    },
    {
        id: "autostart",
        category: "startup",
        get title() {
            return autostartTitle();
        },
        get description() {
            return autostartDescription();
        },
        keywords: "autostart launch boot sign in login log in startup task scheduler launch agent xdg",
    },
    {
        id: "admin-access",
        category: "startup",
        get title() {
            return t("settings.items.admin_access");
        },
        get description() {
            return t("settings.startup.admin_access_description");
        },
        keywords:
            "admin administrator elevated rights permission uac prompt ask each time always allow helper service firewall server blocks connection monitor frame times",
    },
    {
        id: "close-to-tray",
        category: "startup",
        get title() {
            return t("settings.items.close_to_tray");
        },
        get description() {
            return t("settings.startup.tray_description");
        },
        keywords: "background close hide quit minimize system tray",
    },
    {
        id: "open-on-game-start",
        category: "startup",
        get title() {
            return t("settings.items.open_on_game_start");
        },
        get description() {
            return t("settings.startup.open_on_game_start_description");
        },
        keywords: "deadlock game launch starts open show window automatically play tray",
    },
    {
        id: "background-jobs",
        category: "startup",
        get title() {
            return t("settings.items.background_jobs");
        },
        get description() {
            return t("settings.startup.jobs_description");
        },
        keywords:
            "pause slow throttle game running cpu performance fps jobs tasks disable off scan addons at launch mods scripts index patch notes automatically updates search embedding model firewall server block region",
    },
    {
        id: "update-alerts",
        category: "notifications",
        get title() {
            return t("settings.items.update_alerts");
        },
        get description() {
            return t("settings.notifications.alerts_description");
        },
        keywords:
            "updates patch notes steam announcements notify shows as desktop notification toast overlay notification center popup",
    },
    {
        id: "maintenance",
        category: "notifications",
        get title() {
            return t("settings.items.maintenance");
        },
        get description() {
            return t("settings.notifications.maintenance_description");
        },
        keywords:
            "steam weekly maintenance downtime tuesday wednesday utc remind schedule shows as desktop notification toast overlay notification center popup",
    },
    {
        id: "server-blocks-updated",
        category: "notifications",
        get title() {
            return t("settings.items.server_blocks_updated");
        },
        get description() {
            return t("settings.notifications.server_blocks_updated_description");
        },
        keywords:
            "server picker blocks firewall valve server addresses changed relay ip shows as desktop notification toast overlay notification center popup",
    },
    {
        id: "server-blocks-stale",
        category: "notifications",
        get title() {
            return t("settings.items.server_blocks_stale");
        },
        get description() {
            return t("settings.notifications.server_blocks_stale_description");
        },
        keywords:
            "server picker blocks firewall out of date stale failed could not update relay ip shows as desktop notification toast overlay notification center popup",
    },
    {
        id: "break-reminder",
        category: "notifications",
        get title() {
            return t("settings.items.break_reminder");
        },
        get description() {
            return t("settings.notifications.break_reminder_description");
        },
        keywords:
            "break hint reminder tilt loss streak losing sessions rest shows as desktop notification toast overlay notification center popup",
    },
    {
        id: "match-found",
        category: "notifications",
        get title() {
            return t("settings.items.overlay_match_found");
        },
        get description() {
            return t("settings.notifications.overlay_match_found_description");
        },
        keywords: "match found queue pop ready game starting matchmaking alert tabbed out toast overlay popup",
    },
    {
        id: "overlay",
        category: "overlay",
        get title() {
            return t("settings.items.overlay");
        },
        get description() {
            return t("settings.notifications.overlay_description");
        },
        keywords: "overlay in game toast popup over the game full screen borderless window mode",
    },
    {
        id: "overlay-position",
        category: "overlay",
        get title() {
            return t("settings.items.overlay_position");
        },
        get description() {
            return t("settings.notifications.overlay_position_description");
        },
        keywords: "overlay position corner top bottom left right center placement where screen",
    },
    {
        id: "overlay-duration",
        category: "overlay",
        get title() {
            return t("settings.items.overlay_duration");
        },
        get description() {
            return t("settings.notifications.overlay_duration_description");
        },
        keywords: "overlay duration seconds time how long stay visible",
    },
    {
        id: "overlay-notifications",
        category: "overlay",
        get title() {
            return t("settings.items.overlay_notifications");
        },
        get description() {
            return t("settings.notifications.overlay_notifications_description");
        },
        keywords: "overlay match found queue pop notifications turn off disable switch which toasts",
    },
    {
        id: "overlay-test",
        category: "overlay",
        get title() {
            return t("settings.items.overlay_test");
        },
        get description() {
            return t("settings.notifications.overlay_test_description");
        },
        keywords: "overlay test preview try sample example show",
    },
    {
        id: "telemetry",
        category: "privacy",
        get title() {
            return t("settings.items.telemetry");
        },
        get description() {
            return t("settings.privacy.telemetry_description");
        },
        keywords: "telemetry analytics usage statistics error crash report sentry posthog anonymous id reset opt out",
    },
    {
        id: "match-ingest",
        category: "sharing",
        get title() {
            return t("settings.items.match_ingest");
        },
        get description() {
            return t("settings.privacy.ingest_description");
        },
        keywords:
            "ingest upload replay steam id community database share matches community stats match details missing replay",
    },
    {
        id: "gc-recovery",
        category: "sharing",
        get title() {
            return t("settings.items.gc_recovery");
        },
        get description() {
            return t("settings.privacy.gc_description");
        },
        keywords:
            "gc game coordinator steam session token login refresh decrypt ingest matches share community stats match details missing replay",
    },
    {
        id: "version",
        category: "about",
        get title() {
            return t("settings.items.version");
        },
        keywords: "about build app info copy donate ko-fi",
    },
    {
        id: "whats-new",
        category: "about",
        get title() {
            return t("settings.items.whats_new");
        },
        keywords: "changelog release notes changes history version",
    },
    {
        id: "updates",
        category: "about",
        get title() {
            return t("settings.items.updates");
        },
        get description() {
            return t("settings.about_page.auto_check_description");
        },
        keywords: "update upgrade check new version release download install automatic",
    },
    {
        id: "thanks",
        category: "about",
        get title() {
            return t("settings.items.thanks");
        },
        keywords: "thanks credits contributors translators donators supporters donate ko-fi",
    },
    {
        id: "storage",
        category: "storage",
        get title() {
            return t("settings.items.storage");
        },
        keywords: "disk space size cache shader clear delete free folder files",
    },
    {
        id: "diagnostics",
        category: "diagnostics",
        get title() {
            return t("settings.items.diagnostics");
        },
        get description() {
            return t("settings.diagnostics.description");
        },
        keywords: "log logs debug session bug report support report crash viewer",
    },
    {
        id: "licenses",
        category: "about",
        get title() {
            return t("settings.items.licenses");
        },
        get description() {
            return t("settings.licenses.dependencies_description");
        },
        keywords: "third party notices fonts dependencies open source legal gpl copyright trademark valve disclaimer",
    },
];

export const hasOverlay = (p: Platform): boolean => p === "windows";

const needsOverlay = (item: SettingItem) => item.category === "overlay" || item.id === "match-found";

export function itemsFor(p: Platform): SettingItem[] {
    const items = p === "macos" ? BASE_ITEMS.filter((item) => item.id !== "hardware-acceleration") : BASE_ITEMS;
    return items
        .filter((item) => hasOverlay(p) || !needsOverlay(item))
        .filter((item) => p === "windows" || item.id !== "admin-access")
        .map((item) =>
            item.id === "autostart"
                ? {
                      id: item.id,
                      category: item.category,
                      keywords: item.keywords,
                      get title() {
                          return autostartTitle(p);
                      },
                      get description() {
                          return autostartDescription(p);
                      },
                  }
                : item,
        );
}

export const ITEMS: SettingItem[] = itemsFor(platform);

export function categoriesFor(p: Platform): Category[] {
    const listed = matchingCategories(null, itemsFor(p));
    return CATEGORIES.filter((c) => listed.includes(c.id));
}

export const SHOWN_CATEGORIES: Category[] = categoriesFor(platform);

/**
 * Null means no filter is active. Every word of the query must appear in an item's title, category label,
 * description or keywords. `hidden` drops rows the page leaves out at runtime, so search never lists them.
 */
export function matchingItems(query: string, hidden: (id: string) => boolean = () => false): Set<string> | null {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;
    const hits = new Set<string>();
    for (const item of ITEMS) {
        if (hidden(item.id)) continue;
        const category = CATEGORIES.find((c) => c.id === item.category)?.label ?? "";
        const haystack = `${item.title} ${category} ${item.description ?? ""} ${item.keywords}`.toLowerCase();
        if (words.every((w) => haystack.includes(w))) hits.add(item.id);
    }
    return hits;
}

/** Categories with at least one listed item, so a section with nothing on this platform is left out. */
export function matchingCategories(hits: Set<string> | null, items: SettingItem[] = ITEMS): CategoryId[] {
    return CATEGORIES.filter((c) => items.some((i) => i.category === c.id && (hits === null || hits.has(i.id)))).map(
        (c) => c.id,
    );
}
