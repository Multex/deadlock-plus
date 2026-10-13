import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));

/** Every page of the app as a URL pattern, read from the route tree: `/stats`, `/match-history/[id]`. */
export function routePatterns(): string[] {
    return readdirSync(`${SRC}routes`, { recursive: true, encoding: "utf8" })
        .map((file) => file.replaceAll("\\", "/"))
        .filter((file) => file.split("/").at(-1) === "+page.svelte")
        .map((file) => {
            const segments = file.split("/").slice(0, -1);
            return `/${segments.filter((segment) => !/^\(.+\)$/.test(segment)).join("/")}`;
        })
        .sort();
}

export const isDynamic = (pattern: string) => pattern.includes("[");

/** Whether a URL path is served by the pattern; a `[param]` segment takes any one segment. */
export function matches(pattern: string, pathname: string): boolean {
    const source = pattern
        .split("/")
        .map((segment) => (segment.startsWith("[") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
        .join("/");
    return new RegExp(`^${source}/?$`).test(pathname);
}

/** Ids of the settings categories, read from the list the `category` param matcher accepts. */
export function settingsCategories(): string[] {
    const catalog = readFileSync(`${SRC}lib/features/settings/catalog.ts`, "utf8");
    const list = /export const CATEGORIES[^=]*=\s*\[([\s\S]*?)\n\];/.exec(catalog)?.[1] ?? "";
    return [...list.matchAll(/\bid:\s*"([^"]+)"/g)].map((match) => match[1]);
}
