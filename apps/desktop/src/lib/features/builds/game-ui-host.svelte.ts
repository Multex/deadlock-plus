import { provideGameArt, type GameArt } from "@deadlock-plus/game-ui/art";
import type { UiText } from "@deadlock-plus/game-ui/item-tooltip/model";
import { provideGameText } from "@deadlock-plus/game-ui/text";
import type { GameUiStrings } from "@deadlock-plus/ipc-types/GameUiStrings";
import { i18n, t } from "$lib/core/i18n.svelte";
import { keepGameArt, onGameArtChanged } from "$lib/features/gamedata/art-refresh";
import { loadGameUiStrings, loadPropertyIcons, loadShopUiArt } from "$lib/features/gamedata/vdata";

let art = $state.raw<GameArt>({ ui: {}, propertyIcons: {} });
let requested = false;

// A CSS mask or background that fails to load draws nothing, which would leave a card without its tier
// numeral or a tooltip row without its icon, so only images that decode are handed out.
function decodes(url: string): Promise<boolean> {
    const image = new Image();
    image.src = url;
    return image.decode().then(
        () => true,
        () => false,
    );
}

async function decodable<T>(entries: Partial<Record<string, T>>, url: (entry: T) => string) {
    const checked = await Promise.all(
        Object.entries(entries).map(
            async ([key, entry]) => [key, entry, !!entry && (await decodes(url(entry)))] as const,
        ),
    );
    return Object.fromEntries(checked.filter(([, , ok]) => ok).map(([key, entry]) => [key, entry]));
}

async function reload(): Promise<void> {
    const [ui, propertyIcons] = await Promise.all([
        loadShopUiArt().then((images) => decodable(images, (src) => src)),
        loadPropertyIcons().then((icons) => decodable(icons, (icon) => icon.url)),
    ]);
    art = { ui, propertyIcons };
}

/** The game art game-ui components draw with: empty until the first read loads it, refreshed after a game update. */
export function buildsGameArt(): GameArt {
    if (!requested) {
        requested = true;
        keepGameArt(reload);
    }
    return art;
}

let strings = $state.raw<Partial<Record<string, GameUiStrings>>>({});
const requestedLocales = new Set<string>();

async function loadStrings(locale: string): Promise<void> {
    const loaded = await loadGameUiStrings(locale);
    strings = { ...strings, [locale]: loaded };
}

function gameStrings(locale: string): GameUiStrings {
    if (!requestedLocales.has(locale)) {
        if (requestedLocales.size === 0) {
            onGameArtChanged(() => Promise.all([...requestedLocales].map(loadStrings)));
        }
        requestedLocales.add(locale);
        void loadStrings(locale);
    }
    return strings[locale] ?? {};
}

const GAME_PARAM = /\{([a-z]):(\w+)\}/g;
const MARKUP_TAG = /<[^>]*>/g;

/** The game's string with its `{d:name}` / `{s:name}` / `{i:name}` params filled; null when one has no value. */
function fillGameString(template: string, params: Record<string, string | number>): string | null {
    let complete = true;
    const filled = template.replace(MARKUP_TAG, "").replace(GAME_PARAM, (match, kind: string, name: string) => {
        const value = params[name];
        if (value === undefined || !"dsi".includes(kind)) {
            complete = false;
            return match;
        }
        return typeof value === "number" && kind !== "s" ? String(Math.round(value)) : String(value);
    });
    return complete ? filled : null;
}

/** The game's own localised string when it has one for `text.game`, else the app's locale key. */
export function gameUiText(text: UiText): string {
    const template = text.game ? gameStrings(i18n.locale)[text.game.token] : undefined;
    const game = template && text.game ? fillGameString(template, text.game.params) : null;
    return game ?? t(text.key, text.params);
}

/** Call once in a component above every game-ui component. */
export function provideBuildsGameUi(): void {
    provideGameArt(buildsGameArt);
    provideGameText(gameUiText);
}
