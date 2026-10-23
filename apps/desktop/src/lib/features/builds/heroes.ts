import { deadlockApi } from "$lib/core/deadlock-api";
import { i18n } from "$lib/core/i18n.svelte";
import { command } from "$lib/core/tauri";
import { loadHeroes, type Hero } from "$lib/features/heroes/heroes";
import type { AssetHero } from "@deadlock-plus/deadlock-api";
import type { HeroEntry } from "@deadlock-plus/ipc-types/HeroEntry";

export interface HeroFlags {
    disabled?: boolean;
    inDevelopment?: boolean;
    preRelease?: boolean;
    /** The API's word that the hero is out. Released heroes such as Violet and Baba keep the game's development flag. */
    released?: boolean;
}

export function isPlayableHero(hero: HeroFlags): boolean {
    if (hero.disabled || hero.preRelease) return false;
    return !hero.inDevelopment || hero.released === true;
}

/** The game's flags win where it has the hero; only the API knows whether a hero in development is released. */
export function heroFlags(game: readonly HeroEntry[] | null, api: readonly AssetHero[] | null): Map<number, HeroFlags> {
    const out = new Map<number, HeroFlags>();
    for (const a of api ?? []) {
        out.set(a.id, {
            disabled: a.disabled,
            inDevelopment: a.in_development,
            preRelease: a.development_state === "pre_release",
            released: a.development_state === "release" || a.player_selectable === true,
        });
    }
    for (const g of game ?? []) {
        out.set(g.id, {
            disabled: g.disabled,
            inDevelopment: g.inDevelopment,
            preRelease: g.preRelease,
            released: out.get(g.id)?.released,
        });
    }
    return out;
}

/** Sorted by name. A hero no source has flags for keeps the game's own answer. */
export function playableHeroes(heroes: Record<number, Hero>, flags: ReadonlyMap<number, HeroFlags>): Hero[] {
    return Object.values(heroes)
        .filter((h) => {
            const f = flags.get(h.id);
            return f ? isPlayableHero(f) : h.selectable !== false;
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

let flagsLoad: Promise<Map<number, HeroFlags>> | null = null;

/** Asked once per session; a load that reached neither source is asked again next time. */
export function loadHeroFlags(): Promise<Map<number, HeroFlags>> {
    if (flagsLoad) return flagsLoad;
    const pending = Promise.all([
        command<HeroEntry[]>("game_heroes", { locale: i18n.locale }).catch(() => null),
        deadlockApi.heroes().catch(() => null),
    ]).then(([game, api]) => {
        if ((game ?? []).length === 0 && api === null && flagsLoad === pending) flagsLoad = null;
        return heroFlags(game, api);
    });
    flagsLoad = pending;
    return pending;
}

export async function loadPlayableHeroes(): Promise<Hero[]> {
    const [heroes, flags] = await Promise.all([loadHeroes(), loadHeroFlags()]);
    return playableHeroes(heroes, flags);
}
