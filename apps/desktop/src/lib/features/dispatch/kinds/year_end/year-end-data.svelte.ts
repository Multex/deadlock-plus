import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import { i18n } from "$lib/core/i18n.svelte";
import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
import { heroPortrait } from "../../art";
import { dispatchViewDeps } from "../../components/view-deps";
import type { EditionView } from "../../edition-view";
import { yearEndBackdrop } from "./backdrop";
import { yearEndView, type YearEndDeps } from "./year-end-view";

function yearEndDeps(heroes: Record<number, Hero>): YearEndDeps {
    return {
        ...dispatchViewDeps(heroes, []),
        monthShort: (s, tz) => new Intl.DateTimeFormat(i18n.locale, { month: "short", timeZone: tz }).format(s * 1000),
    };
}

/**
 * The Year-End view plus the cover art, loaded for the edition's star hero. Call during component init: it sets
 * up its own effects.
 */
export function useYearEnd(edition: () => Edition, view: () => EditionView) {
    let heroes = $state.raw<Record<number, Hero>>({});
    let art = $state.raw<{ heroId: number; backdrop: string | null; portrait: string | null } | null>(null);

    const data = $derived(yearEndView(edition(), view(), yearEndDeps(heroes)));
    const starId = $derived(data.cover.star?.heroId ?? null);

    $effect(() => {
        void loadHeroes().then((h) => (heroes = h));
        return onHeroesRefreshed((h) => (heroes = h));
    });

    $effect(() => {
        const id = starId;
        if (id === null) return;
        let live = true;
        void Promise.all([yearEndBackdrop(id), heroPortrait(id)]).then(([backdrop, portrait]) => {
            if (live) art = { heroId: id, backdrop, portrait };
        });
        return () => (live = false);
    });

    return {
        get view() {
            return data;
        },
        get backdrop() {
            return art && art.heroId === starId ? art.backdrop : null;
        },
        get portrait() {
            return art && art.heroId === starId ? art.portrait : null;
        },
    };
}
