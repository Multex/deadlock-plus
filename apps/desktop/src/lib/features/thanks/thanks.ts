import { i18n } from "$lib/core/i18n.svelte";
import { LANGUAGES } from "$lib/features/settings/languages";
import raw from "./thanks.json";

export interface Person {
    name: string;
    url?: string;
}

export interface Translator extends Person {
    languages: string[];
}

export interface Thanks {
    contributors: Person[];
    translators: Translator[];
    donators: { names: string[]; others: number };
}

function link(url: unknown): string | undefined {
    return typeof url === "string" && url.startsWith("https://") ? url : undefined;
}

function person(p: Person): Person[] {
    const name = p.name?.trim();
    if (!name) return [];
    const url = link(p.url);
    return [url ? { name, url } : { name }];
}

export function parseThanks(data: Thanks): Thanks {
    return {
        contributors: data.contributors.flatMap(person),
        translators: data.translators.flatMap((t) => person(t).map((p) => ({ ...p, languages: t.languages ?? [] }))),
        donators: {
            names: data.donators.names.map((n) => n.trim()).filter(Boolean),
            others: Math.max(0, Math.floor(data.donators.others)),
        },
    };
}

export function isEmpty(t: Thanks): boolean {
    return (
        t.contributors.length === 0 &&
        t.translators.length === 0 &&
        t.donators.names.length === 0 &&
        t.donators.others === 0
    );
}

export function donatorsOthersKey(names: string[]): "settings.thanks.anonymous" | "settings.thanks.others" {
    return names.length === 0 ? "settings.thanks.anonymous" : "settings.thanks.others";
}

function localizedName(code: string, locale: string): string | undefined {
    try {
        return new Intl.DisplayNames([locale], { type: "language" }).of(code);
    } catch {
        return undefined;
    }
}

/** Each language in itself, followed by its name in `locale` unless the two match. */
export function translatorLanguages(t: Translator, locale: string = i18n.locale): string[] {
    return t.languages.flatMap((code) => {
        const native = LANGUAGES.find((l) => l.code === code)?.name;
        if (!native) return [];
        const local = localizedName(code, locale);
        return local && local.toLowerCase() !== native.toLowerCase() ? `${native} (${local})` : native;
    });
}

export const THANKS: Thanks = parseThanks(raw);
