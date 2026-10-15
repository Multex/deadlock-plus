import { t } from "$lib/core/i18n.svelte";
import type { Platform } from "$lib/core/platform";
import { jumpTargets, MAX_PAGE_JUMPS, modifierLabel } from "./shortcuts";

export type CommandGroup = "pages" | "settings" | "actions" | "shortcuts";

export interface Command {
    id: string;
    label: string;
    group: CommandGroup;
    keywords: string;
    shortcut?: string;
    run: () => void;
}

export interface CommandDeps {
    pages: { id: string; label: string; href: string; group?: "tools" }[];
    settingsSections: { id: string; label: string }[];
    platform: Platform;
    go: (href: string) => void;
    checkForUpdates: () => void;
    openSupport: () => void;
}

export function buildCommands(deps: CommandDeps): Command[] {
    const mod = modifierLabel(deps.platform);
    const commands: Command[] = [];
    const jumps = jumpTargets(deps.pages);

    for (const page of deps.pages) {
        const digit = jumps.indexOf(page) + 1;
        commands.push({
            id: `page:${page.id}`,
            label: page.label,
            group: "pages",
            keywords: `${t("keyboard.keywords.page")} ${page.id}`,
            shortcut: digit > 0 ? `${mod}+${digit}` : undefined,
            run: () => deps.go(page.href),
        });
    }

    for (const section of deps.settingsSections) {
        commands.push({
            id: `settings:${section.id}`,
            label: t("keyboard.settings_section", { section: section.label }),
            group: "settings",
            keywords: `${t("keyboard.keywords.settings")} ${section.id}`,
            run: () => deps.go(`/settings/${section.id}`),
        });
    }

    commands.push(
        {
            id: "action:settings",
            label: t("keyboard.open_settings"),
            group: "actions",
            keywords: t("keyboard.keywords.settings"),
            run: () => deps.go("/settings"),
        },
        {
            id: "action:check-updates",
            label: t("keyboard.check_updates"),
            group: "actions",
            keywords: t("keyboard.keywords.updates"),
            run: deps.checkForUpdates,
        },
        {
            id: "action:support",
            label: t("keyboard.support"),
            group: "actions",
            keywords: t("keyboard.keywords.support"),
            run: deps.openSupport,
        },
        {
            id: "shortcut:palette",
            label: t("keyboard.open_palette"),
            group: "shortcuts",
            keywords: t("keyboard.keywords.palette"),
            shortcut: `${mod}+K`,
            run: () => {},
        },
        {
            id: "shortcut:jump",
            label: t("keyboard.jump"),
            group: "shortcuts",
            keywords: t("keyboard.keywords.jump"),
            shortcut: `${mod}+1-${MAX_PAGE_JUMPS}`,
            run: () => {},
        },
    );

    return commands;
}
