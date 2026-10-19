import { ITEMS, type SettingItem } from "./catalog";
import { settingsUi } from "./ui.svelte";

export function settingPath(id: string, items: SettingItem[] = ITEMS): string | null {
    const item = items.find((i) => i.id === id);
    return item ? `/settings/${item.category}` : null;
}

/** Opens the page holding the row and flags it so the page scrolls to it and highlights it. */
export function jumpToSetting(id: string, navigate: (path: string) => unknown, items: SettingItem[] = ITEMS): void {
    const path = settingPath(id, items);
    if (!path) return;
    settingsUi.query = "";
    settingsUi.highlightId = id;
    void navigate(path);
}

export type HighlightStep = "wait" | "consume" | "drop";

/** The flag is only used up on the page that holds the row; the settings page is reused across categories. */
export function highlightStep(id: string, category: string, items: SettingItem[] = ITEMS): HighlightStep {
    const item = items.find((i) => i.id === id);
    if (!item) return "drop";
    return item.category === category ? "consume" : "wait";
}
