import { deadlockApi } from "$lib/core/deadlock-api";
import { command, fileSrc } from "$lib/core/tauri";
import { i18n } from "$lib/core/i18n.svelte";
import { prefs } from "$lib/core/prefs";
import { onGameArtChanged } from "$lib/features/gamedata/art-refresh";
import type { AssetHero } from "@deadlock-plus/deadlock-api";
import type { HeroArt } from "@deadlock-plus/ipc-types/HeroArt";
import type { HeroEntry } from "@deadlock-plus/ipc-types/HeroEntry";

export interface Hero {
    id: number;
    name: string;
    icon: string | null;
    /** Hero card PNG, sent to Discord as the large image. */
    portrait: string | null;
    /** Small square PNG icon, sent to Discord. */
    artIcon: string | null;
    /** The hero's own hideout line, such as "Plotting in the Hideout". */
    hideoutLine: string | null;
    /** Remote URL of `portrait`, for Discord. Absent when the hero was not merged with local art. */
    apiPortrait?: string | null;
    /** Remote URL of `artIcon`, for Discord. Absent when the hero was not merged with local art. */
    apiArtIcon?: string | null;
    /** The game's own flag for heroes a player can pick. Absent when only the API knows the hero. */
    selectable?: boolean;
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function slimHeroes(raw: AssetHero[]): Record<number, Hero> {
    const out: Record<number, Hero> = {};
    for (const h of raw) {
        out[h.id] = {
            id: h.id,
            name: h.name,
            icon: h.images?.icon_image_small_webp ?? null,
            portrait: h.images?.icon_hero_card ?? null,
            artIcon: h.images?.icon_image_small ?? null,
            hideoutLine: h.hideout_rich_presence ?? null,
        };
    }
    return out;
}

/**
 * The game decides the roster, names and (when it has them) art. The API fills in what the game files do not
 * carry: the webp icon and the hideout line. Heroes only the API knows stay, so no id loses its name.
 */
export function mergeHeroes(game: HeroEntry[], api: Record<number, Hero>, art: HeroArt[] = []): Record<number, Hero> {
    const out: Record<number, Hero> = { ...api };
    const local = new Map(art.map((x) => [x.id, x]));
    for (const g of game) {
        const a = api[g.id];
        if (!g.localised && !a) continue;
        const l = local.get(g.id);
        const apiPortrait = g.card ?? a?.portrait ?? null;
        const apiArtIcon = g.portrait ?? a?.artIcon ?? null;
        out[g.id] = {
            id: g.id,
            name: g.name,
            icon: l?.sm ? fileSrc(l.sm) : (a?.icon ?? g.portrait),
            portrait: l?.card ? fileSrc(l.card) : apiPortrait,
            artIcon: l?.sm ? fileSrc(l.sm) : apiArtIcon,
            apiPortrait,
            apiArtIcon,
            hideoutLine: a?.hideoutLine ?? null,
            selectable: g.selectable,
        };
    }
    return out;
}

export function parseHeroCache(raw: string | null, now: number, allowStale: boolean): Record<number, Hero> | null {
    if (!raw) return null;
    try {
        const { at, heroes } = JSON.parse(raw) as { at: number; heroes: Record<number, Hero> };
        const hasArt = Object.values(heroes).every(
            (h) => h.portrait !== undefined && h.artIcon !== undefined && h.hideoutLine !== undefined,
        );
        return allowStale || (hasArt && now - at < MAX_AGE_MS) ? heroes : null;
    } catch {
        return null;
    }
}

function readCache(allowStale: boolean): Record<number, Hero> | null {
    return parseHeroCache(prefs.getString("heroCache"), Date.now(), allowStale);
}

function writeCache(heroes: Record<number, Hero>) {
    prefs.setString("heroCache", JSON.stringify({ at: Date.now(), heroes }));
}

const RETRY_MS = 60 * 1000;
export const ART_RETRY_MS = 60 * 60 * 1000;

/** Whether a hero the game reported is missing from `known`, at most once per `RETRY_MS`. */
export function needsRefresh(
    known: Record<number, Hero>,
    wanted: Iterable<number>,
    lastAttemptAt: number | null,
    now: number,
): boolean {
    if (lastAttemptAt !== null && now - lastAttemptAt < RETRY_MS) return false;
    for (const id of wanted) if (!(id in known)) return true;
    return false;
}

/** Discord art is the remote URL; local file paths cannot reach Discord. */
export function lacksDiscordArt(hero: Hero): boolean {
    const icon = hero.apiArtIcon !== undefined ? hero.apiArtIcon : hero.artIcon;
    const portrait = hero.apiPortrait !== undefined ? hero.apiPortrait : hero.portrait;
    return icon === null && portrait === null;
}

/** Whether a wanted hero is known but has no Discord art, at most once per `ART_RETRY_MS`. */
export function needsArtRefetch(
    known: Record<number, Hero>,
    wanted: Iterable<number>,
    lastAttemptAt: number | null,
    now: number,
): boolean {
    if (lastAttemptAt !== null && now - lastAttemptAt < ART_RETRY_MS) return false;
    for (const id of wanted) if (id in known && lacksDiscordArt(known[id])) return true;
    return false;
}

interface Loaded {
    locale: string;
    game: HeroEntry[] | null;
    art: HeroArt[];
    heroes: Record<number, Hero>;
}

let loaded: Loaded | null = null;
let inflight: { locale: string; promise: Promise<Record<number, Hero>> } | null = null;
let lastLoadAt: number | null = null;
let apiFetch: Promise<Record<number, Hero> | null> | null = null;
let lastApiAttemptAt: number | null = null;
let lastArtAttemptAt: number | null = null;
let generation = 0;

const listeners = new Set<(heroes: Record<number, Hero>) => void>();

/** Fires when the hero data was replaced: the app language changed, or fresher API data arrived. */
export function onHeroesRefreshed(fn: (heroes: Record<number, Hero>) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

function notify(heroes: Record<number, Hero>) {
    for (const fn of listeners) fn(heroes);
}

async function loadGame(locale: string): Promise<HeroEntry[] | null> {
    try {
        const list = await command<HeroEntry[]>("game_heroes", { locale });
        return list.length > 0 ? list : null;
    } catch {
        return null;
    }
}

async function loadArt(): Promise<HeroArt[]> {
    try {
        return await command<HeroArt[]>("game_hero_art");
    } catch {
        return [];
    }
}

function fetchApi(): Promise<Record<number, Hero> | null> {
    if (apiFetch) return apiFetch;
    const p: Promise<Record<number, Hero> | null> = (async () => {
        try {
            const heroes = slimHeroes(await deadlockApi.heroes());
            writeCache(heroes);
            return heroes;
        } catch {
            return null;
        }
    })().finally(() => {
        if (apiFetch === p) apiFetch = null;
    });
    apiFetch = p;
    return p;
}

function refreshApiInBackground() {
    const now = Date.now();
    if (lastApiAttemptAt !== null && now - lastApiAttemptAt < RETRY_MS) return;
    lastApiAttemptAt = now;
    void fetchApi().then((api) => {
        if (!api || !loaded) return;
        loaded = { ...loaded, heroes: loaded.game ? mergeHeroes(loaded.game, api, loaded.art) : api };
        notify(loaded.heroes);
    });
}

function refetchMissingArt(wanted: number[]) {
    if (!loaded || !needsArtRefetch(loaded.heroes, wanted, lastArtAttemptAt, Date.now())) return;
    lastArtAttemptAt = Date.now();
    refreshApiInBackground();
}

async function build(locale: string, wanted: number[]): Promise<Record<number, Hero>> {
    const started = generation;
    lastLoadAt = Date.now();
    const [game, art] = await Promise.all([loadGame(locale), loadArt()]);
    const fresh = readCache(false);
    let heroes: Record<number, Hero>;
    if (game) {
        heroes = mergeHeroes(game, fresh ?? readCache(true) ?? {}, art);
        if (!fresh) refreshApiInBackground();
    } else {
        heroes = fresh ?? (await fetchApi()) ?? readCache(true) ?? {};
    }
    if (locale === i18n.locale && started === generation) {
        loaded = { locale, game, art, heroes };
        refetchMissingArt(wanted);
    }
    return heroes;
}

/**
 * Hero names come from the installed game in the app's language; the API supplies art extras and is the
 * whole roster when the game cannot answer. `wanted` are hero ids seen in the game: one missing from the
 * loaded heroes (a patch landed while the app ran) triggers a reload, at most once a minute.
 */
export function loadHeroes(wanted: Iterable<number> = []): Promise<Record<number, Hero>> {
    const locale = i18n.locale;
    const ids = [...wanted];
    if (loaded?.locale === locale && !needsRefresh(loaded.heroes, ids, lastLoadAt, Date.now())) {
        refetchMissingArt(ids);
        return Promise.resolve(loaded.heroes);
    }
    if (inflight?.locale === locale) return inflight.promise;
    const promise = build(locale, ids).finally(() => {
        if (inflight?.promise === promise) inflight = null;
    });
    inflight = { locale, promise };
    return promise;
}

i18n.onLocaleChange(() => {
    if (!loaded && !inflight) return;
    void loadHeroes().then(notify);
});

onGameArtChanged(async () => {
    if (!loaded && !inflight) return;
    // A build started before the change may hold old-folder paths; it must not become `loaded`.
    generation++;
    loaded = null;
    inflight = null;
    notify(await loadHeroes());
});
