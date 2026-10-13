import type { Hero } from "$lib/features/heroes/heroes";
import type { PresenceTimer } from "@deadlock-plus/ipc-types/PresenceTimer";
import type { SelectMenuItem } from "@deadlock-plus/ui/select-menu";
import { SOURCE_KINDS, TIMERS, type SourceKind } from "./editor";

export type HeroItem = SelectMenuItem & { icon: string | null; all: boolean };

export function heroItems(heroes: Hero[], allLabel: string): HeroItem[] {
    return [
        { value: "", label: allLabel, icon: null, all: true },
        ...heroes.map((h) => ({ value: String(h.id), label: h.name, icon: h.icon, all: false })),
    ];
}

export function heroIdFromValue(value: string): number | undefined {
    return value ? Number(value) : undefined;
}

export type SourceItem = SelectMenuItem & { kind: SourceKind };

/** The mode icon cannot be picked, but a config that already uses it must still show it. */
export function sourceItems(current: SourceKind, label: (kind: SourceKind) => string): SourceItem[] {
    const kinds = current === "modeIcon" ? [...SOURCE_KINDS, current] : SOURCE_KINDS;
    return kinds.map((kind) => ({ value: kind, label: label(kind), kind }));
}

export type SourceArt = { heroPortrait: string | null; heroIcon: string | null; rankBadge: string | null };

export function sourceThumb(kind: SourceKind, art: SourceArt): string | null {
    return kind === "heroPortrait" || kind === "heroIcon" || kind === "rankBadge" ? art[kind] : null;
}

export type TimerItem = SelectMenuItem & { timer: PresenceTimer };

export function timerItems(label: (timer: PresenceTimer) => string): TimerItem[] {
    return TIMERS.map((timer) => ({ value: timer, label: label(timer), timer }));
}
