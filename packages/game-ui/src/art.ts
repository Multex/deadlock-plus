import { getContext, setContext } from "svelte";
import type { ShopUiImage } from "@deadlock-plus/ipc-types/ShopUiImage";

export type UiArt = Partial<Record<ShopUiImage, string>>;

export type PropertyIcon = {
    url: string;
    /** The colour the game washes the icon with, or null. */
    wash: string | null;
    /** Label colour for an inline attribute keyword; null keeps the surrounding text colour. */
    color?: string | null;
};

/**
 * Image urls the host app resolved from the installed game. Every entry is optional: components draw a
 * plain CSS fallback when an image is missing (no install, or a game update renamed it).
 */
export type GameArt = {
    ui: UiArt;
    /** Keyed by a property's `cssClass` or a status cell's key. */
    propertyIcons: Partial<Record<string, PropertyIcon>>;
};

const KEY = Symbol("game-ui art");
const EMPTY: GameArt = { ui: {}, propertyIcons: {} };

/** Call in a component above every game-ui component; pass a getter so the art can load later. */
export function provideGameArt(art: () => GameArt): void {
    setContext(KEY, art);
}

export function gameArt(): () => GameArt {
    return getContext<(() => GameArt) | undefined>(KEY) ?? (() => EMPTY);
}
