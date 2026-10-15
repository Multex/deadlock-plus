import { prefs } from "$lib/core/prefs";

class SidebarState {
    collapsed = $state(prefs.getBool("sidebarCollapsed", false));
    toolsOpen = $state(prefs.getBool("sidebarToolsOpen", true));

    toggle() {
        this.collapsed = !this.collapsed;
        prefs.setBool("sidebarCollapsed", this.collapsed);
    }

    toggleTools() {
        this.toolsOpen = !this.toolsOpen;
        prefs.setBool("sidebarToolsOpen", this.toolsOpen);
    }
}

export const sidebarState = new SidebarState();

interface NavItem {
    href: string;
    group?: "tools";
    badge?: () => number;
}

export function splitNav<T extends NavItem>(entries: T[]): { main: T[]; tools: T[] } {
    return { main: entries.filter((e) => !e.group), tools: entries.filter((e) => e.group === "tools") };
}

/** A closed group still shows the page you are on, so the active link never disappears. */
export function shownTools<T extends NavItem>(tools: T[], open: boolean, isActive: (href: string) => boolean): T[] {
    return open ? tools : tools.filter((e) => isActive(e.href));
}

export function hiddenBadge<T extends NavItem>(tools: T[], shown: T[]): number {
    return tools.filter((e) => !shown.includes(e)).reduce((sum, e) => sum + (e.badge?.() ?? 0), 0);
}
