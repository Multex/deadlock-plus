import { WEB_LOCALES } from "@deadlock-plus/links";
import { DEFAULT_LOCALE } from "./core";

/** Pages served in every locale. Privacy and Transparency stay English only. */
export const LOCALIZED_PAGES: readonly string[] = ["/", "/features", "/download", "/faq"];

function split(pathname: string): { locale: string; rest: string } | null {
    const [, first = "", ...more] = pathname.split("/");
    if (!WEB_LOCALES.includes(first)) return null;
    return { locale: first, rest: `/${more.join("/")}` };
}

/** The page's language, from its path. A locale prefix on a page that does not exist still names the error page's. */
export function localeOf(pathname: string): string {
    return split(pathname)?.locale ?? DEFAULT_LOCALE;
}

/** The English route that serves a localized path, or undefined when the path is not a localized page. */
export function localizedRoute(pathname: string): string | undefined {
    const parts = split(pathname);
    return parts && LOCALIZED_PAGES.includes(parts.rest) ? parts.rest : undefined;
}

/** The English path of a page, with any locale prefix taken off. */
export function unlocalizedPath(pathname: string): string {
    return localizedRoute(pathname) ?? pathname;
}

/** A same-site link in `locale`. English, English-only pages and other sites keep their address. */
export function localizedHref(href: string, locale: string): string {
    if (locale === DEFAULT_LOCALE || !href.startsWith("/") || href.startsWith("//")) return href;
    const end = href.search(/[?#]/);
    const path = end === -1 ? href : href.slice(0, end);
    if (!LOCALIZED_PAGES.includes(path)) return href;
    const suffix = end === -1 ? "" : href.slice(end);
    return `/${locale}${path === "/" ? "" : path}${suffix}`;
}

export interface Alternate {
    hreflang: string;
    path: string;
}

/** Every language's address for a localized page, with English as the default; none for an English-only page. */
export function alternates(pathname: string): Alternate[] {
    const path = unlocalizedPath(pathname);
    if (!LOCALIZED_PAGES.includes(path)) return [];
    return [
        { hreflang: DEFAULT_LOCALE, path },
        ...WEB_LOCALES.map((locale) => ({ hreflang: locale, path: localizedHref(path, locale) })),
        { hreflang: "x-default", path },
    ];
}
