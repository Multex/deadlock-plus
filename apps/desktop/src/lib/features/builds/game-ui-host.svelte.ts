import { provideGameArt, type GameArt } from "@deadlock-plus/game-ui/art";
import type { UiText } from "@deadlock-plus/game-ui/item-tooltip/model";
import { provideGameText } from "@deadlock-plus/game-ui/text";
import type { GameUiStrings } from "@deadlock-plus/ipc-types/GameUiStrings";
import type { HeroStatsData } from "@deadlock-plus/ipc-types/HeroStatsData";
import { i18n, t } from "$lib/core/i18n.svelte";
import { keepGameArt, onGameArtChanged } from "$lib/features/gamedata/art-refresh";
import { loadAbilityArt, loadHeroMinimapArt } from "$lib/features/gamedata/gamedata";
import { loadGameUiStrings, loadHeroStats, loadPropertyIcons, loadShopUiArt } from "$lib/features/gamedata/vdata";
import { loadHeroes } from "$lib/features/heroes/heroes";

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

export interface BuildsHero {
    stats: HeroStatsData | null;
    icon: string | null;
    /** The weapon ability's image, which the ALT panel draws beside bullet damage. */
    weaponIcon: string | null;
}

let heroes = $state.raw<ReadonlyMap<number, BuildsHero>>(new Map());
const requestedHeroes = new Set<number>();

// The minimap head, as the game's popular marker draws it, else the hero's icon.
async function heroIcon(heroId: number): Promise<string | null> {
    return (await loadHeroMinimapArt())[heroId] ?? (await loadHeroes([heroId]))[heroId]?.icon ?? null;
}

async function abilityIcon(className: string | undefined): Promise<string | null> {
    if (!className) return null;
    return (await loadAbilityArt([className]).catch((): Record<string, string> => ({})))[className] ?? null;
}

async function loadHero(heroId: number): Promise<void> {
    const [stats, icon] = await Promise.all([loadHeroStats(heroId), heroIcon(heroId).catch(() => null)]);
    const weaponIcon = await abilityIcon(stats?.weaponAbility);
    heroes = new Map(heroes).set(heroId, { stats, icon, weaponIcon });
}

/** A hero's stats, portrait and weapon image for tooltips; null until loaded, reloaded after a game update. */
export function buildsHero(heroId: number): BuildsHero | null {
    if (!requestedHeroes.has(heroId)) {
        if (requestedHeroes.size === 0) {
            onGameArtChanged(() => Promise.all([...requestedHeroes].map(loadHero)));
        }
        requestedHeroes.add(heroId);
        void loadHero(heroId);
    }
    return heroes.get(heroId) ?? null;
}

/** Call once in a component above every game-ui component. */
export function provideBuildsGameUi(): void {
    provideGameArt(buildsGameArt);
    provideGameText(gameUiText);
}
