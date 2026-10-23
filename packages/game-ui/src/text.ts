import { getContext, setContext } from "svelte";
import type { UiText } from "./item-tooltip/model";

export type GameText = (text: UiText) => string;

const KEY = Symbol("game-ui text");

/** The host resolves each UiText: the game's own localised string when it has one, else its locale key. */
export function provideGameText(resolve: GameText): void {
    setContext(KEY, resolve);
}

export function gameText(): GameText {
    return getContext<GameText | undefined>(KEY) ?? ((text) => text.key);
}
