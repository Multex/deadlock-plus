import type { Component } from "svelte";
import { Bell, Bug, Info, Languages, Heart, MessageCircle, Palette, Power, Scale, Shield } from "@lucide/svelte";
import { platform, type Platform } from "$lib/core/platform";
import { t } from "$lib/core/i18n.svelte";
import { autostartTitle } from "./autostart";

export type CategoryId =
    | "appearance"
    | "language"
    | "startup"
    | "notifications"
    | "discord"
    | "privacy"
    | "about"
    | "diagnostics"
    | "thanks"
    | "licenses";

export interface Category {
    id: CategoryId;
    label: string;
    icon: Component<{ class?: string }>;
}

export interface SettingItem {
    id: string;
    category: CategoryId;
    title: string;
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
        id: "discord",
        get label() {
            return t("settings.categories.discord");
        },
        icon: MessageCircle,
    },
    {
        id: "privacy",
        get label() {
            return t("settings.categories.privacy");
        },
        icon: Shield,
    },
    {
        id: "about",
        get label() {
            return t("settings.categories.about");
        },
        icon: Info,
    },
    {
        id: "diagnostics",
        get label() {
            return t("settings.categories.diagnostics");
        },
        icon: Bug,
    },
    {
        id: "thanks",
        get label() {
            return t("settings.categories.thanks");
        },
        icon: Heart,
    },
    {
        id: "licenses",
        get label() {
            return t("settings.categories.licenses");
        },
        icon: Scale,
    },
];

const BASE_ITEMS: SettingItem[] = [
    {
        id: "theme",
        category: "appearance",
        get title() {
            return t("settings.items.theme");
        },
        keywords: "colour color dark light midnight daylight contrast palette appearance",
    },
    {
        id: "reduced-motion",
        category: "appearance",
        get title() {
            return t("settings.items.reduced_motion");
        },
        keywords: "animation animations transitions motion accessibility vestibular system",
    },
    {
        id: "accessible-font",
        category: "appearance",
        get title() {
            return t("settings.items.accessible_font");
        },
        keywords: "atkinson hyperlegible dyslexia low vision readable text typeface",
    },
    {
        id: "language",
        category: "language",
        get title() {
            return t("settings.language.label");
        },
        keywords: "locale translation translate english system display flag completion crowdin",
    },
    {
        id: "autostart",
        category: "startup",
        get title() {
            return autostartTitle();
        },
        keywords: "autostart launch boot sign in login log in startup task scheduler launch agent xdg",
    },
    {
        id: "close-to-tray",
        category: "startup",
        get title() {
            return t("settings.items.close_to_tray");
        },
        keywords: "background close hide quit minimize system tray",
    },
    {
        id: "background-jobs",
        category: "startup",
        get title() {
            return t("settings.items.background_jobs");
        },
        keywords:
            "pause slow throttle game running cpu performance fps jobs tasks disable off scan addons at launch mods scripts index patch notes automatically updates search embedding model",
    },
    {
        id: "update-alerts",
        category: "notifications",
        get title() {
            return t("settings.items.update_alerts");
        },
        keywords: "updates patch notes steam announcements toast notify",
    },
    {
        id: "maintenance",
        category: "notifications",
        get title() {
            return t("settings.items.maintenance");
        },
        keywords: "steam weekly maintenance downtime tuesday wednesday utc remind toast schedule",
    },
    {
        id: "discord-presence",
        category: "discord",
        get title() {
            return t("settings.items.discord_presence");
        },
        keywords: "discord rich presence rpc status activity playing game ptb canary",
    },
    {
        id: "discord-clients",
        category: "discord",
        get title() {
            return t("settings.items.discord_clients");
        },
        keywords: "discord client stable ptb canary pipe running which",
    },
    {
        id: "discord-editor",
        category: "discord",
        get title() {
            return t("settings.items.discord_editor");
        },
        keywords:
            "discord presence editor customise customize template details state text image icon timer placeholder hero import export preview reset",
    },
    {
        id: "telemetry",
        category: "privacy",
        get title() {
            return t("settings.items.telemetry");
        },
        keywords: "telemetry analytics usage statistics error crash report sentry posthog anonymous id reset opt out",
    },
    {
        id: "match-ingest",
        category: "privacy",
        get title() {
            return t("settings.items.match_ingest");
        },
        keywords: "ingest upload replay salts steam id http cache community database telemetry",
    },
    {
        id: "gc-recovery",
        category: "privacy",
        get title() {
            return t("settings.items.gc_recovery");
        },
        keywords: "gc game coordinator salts steam session token login refresh decrypt ingest matches",
    },
    {
        id: "version",
        category: "about",
        get title() {
            return t("settings.items.version");
        },
        keywords: "about build app info copy bug report support donate ko-fi",
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
        keywords: "update upgrade check new version release download install automatic",
    },
    {
        id: "thanks",
        category: "thanks",
        get title() {
            return t("settings.items.thanks");
        },
        keywords: "thanks credits contributors translators donators supporters donate ko-fi",
    },
    {
        id: "diagnostics",
        category: "diagnostics",
        get title() {
            return t("settings.items.diagnostics");
        },
        keywords: "log logs debug session bug report viewer",
    },
    {
        id: "licenses",
        category: "licenses",
        get title() {
            return t("settings.items.licenses");
        },
        keywords: "third party notices fonts dependencies open source legal",
    },
];

/** Null means no filter is active. Every word of the query must appear in an item's title or keywords. */
export function itemsFor(p: Platform): SettingItem[] {
    return BASE_ITEMS.map((item) =>
        item.id === "autostart"
            ? {
                  id: item.id,
                  category: item.category,
                  keywords: item.keywords,
                  get title() {
                      return autostartTitle(p);
                  },
              }
            : item,
    );
}

export const ITEMS: SettingItem[] = itemsFor(platform);

export function matchingItems(query: string): Set<string> | null {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;
    const hits = new Set<string>();
    for (const item of ITEMS) {
        const haystack = `${item.title} ${item.keywords}`.toLowerCase();
        if (words.every((w) => haystack.includes(w))) hits.add(item.id);
    }
    return hits;
}

export function matchingCategories(hits: Set<string> | null): CategoryId[] {
    return CATEGORIES.filter((c) => hits === null || ITEMS.some((i) => i.category === c.id && hits.has(i.id))).map(
        (c) => c.id,
    );
}
