import type { Platform } from "$lib/core/platform";

export interface KeyInput {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
}

export interface TargetInput {
    tagName?: string;
    isContentEditable?: boolean;
}

export const MAX_PAGE_JUMPS = 9;

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function modifierLabel(platform: Platform): string {
    return platform === "macos" ? "Cmd" : "Ctrl";
}

/** True when exactly the platform's command modifier is held: Cmd on macOS, Ctrl elsewhere. */
function onlyCommandModifier(e: KeyInput, platform: Platform): boolean {
    if (e.altKey || e.shiftKey) return false;
    return platform === "macos" ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

export function isPaletteKey(e: KeyInput, platform: Platform): boolean {
    return onlyCommandModifier(e, platform) && e.key.toLowerCase() === "k";
}

/** Zero-based page index for Ctrl/Cmd+1..9, otherwise null. */
export function pageJumpIndex(e: KeyInput, platform: Platform): number | null {
    if (!onlyCommandModifier(e, platform) || !/^[1-9]$/.test(e.key)) return null;
    return Number(e.key) - 1;
}

/** Pages Ctrl/Cmd+1..9 jump to, in order: grouped entries (the sidebar's Tools) get no digit. */
export function jumpTargets<T extends { group?: string }>(entries: T[]): T[] {
    return entries.filter((e) => !e.group).slice(0, MAX_PAGE_JUMPS);
}

export function isTypingTarget(target: TargetInput | null | undefined): boolean {
    if (!target) return false;
    return target.isContentEditable === true || TYPING_TAGS.has(target.tagName ?? "");
}
