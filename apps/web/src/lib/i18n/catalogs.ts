import type { Catalog } from "./core";

// Lazy, so each language is its own chunk and only its own pages fetch it.
const loaders = import.meta.glob<Catalog>(
    [
        "../../../../../locales/web/*.json",
        "!../../../../../locales/web/en.json",
        "!../../../../../locales/web/*.notes.json",
    ],
    { import: "default" },
);

const loaderFor = (code: string) => loaders[`../../../../../locales/web/${code}.json`];

export async function catalogsFor(locale: string): Promise<Record<string, Catalog>> {
    const catalogs: Record<string, Catalog> = {};
    for (const code of new Set([locale, locale.split("-")[0] ?? locale])) {
        const load = loaderFor(code);
        if (load) catalogs[code] = await load();
    }
    return catalogs;
}
