// Imported rather than served from `static/`, so each picture gets a content-hashed name and a year-long cache.
const FULL = import.meta.glob<string>("$lib/assets/screenshots/*.webp", {
    eager: true,
    query: "?url",
    import: "default",
});
const SMALL = import.meta.glob<string>("$lib/assets/screenshots/small/*.webp", {
    eager: true,
    query: "?url",
    import: "default",
});

function byName(urls: Record<string, string>): Map<string, string> {
    return new Map(
        Object.entries(urls).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1, -".webp".length), url]),
    );
}

const full = byName(FULL);
const small = byName(SMALL);

/** Every screenshot file name, without extension. */
export const SHOT_NAMES = [...full.keys()];

export function shotUrl(name: string): string {
    const url = full.get(name);
    if (!url) throw new Error(`No screenshot named ${name}`);
    return url;
}

/** The copy of a phone close-up drawn on the page; the full one is kept for the zoom viewer. */
export function smallShotUrl(name: string): string {
    return small.get(name) ?? shotUrl(name);
}
