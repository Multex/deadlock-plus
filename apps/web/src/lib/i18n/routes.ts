import { WEB_LOCALES } from "@deadlock-plus/links";
import { DEFAULT_LOCALE } from "./core";

/** Pages served in every locale. Privacy and Transparency stay English only. */
export const LOCALIZED_PAGES: readonly string[] = ["/", "/features", "/download", "/faq", "/themes"];

// A pattern rather than the theme list, so the routing every page loads first never carries the theme data. An id
// that is not a theme still reaches the route, which answers 404 in the visitor's language.
const THEME_PAGE = /^\/themes\/[a-z0-9]+(-[a-z0-9]+)*$/;

function isLocalizedPage(path: string): boolean {
    return LOCALIZED_PAGES.includes(path) || THEME_PAGE.test(path);
}

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
    return parts && isLocalizedPage(parts.rest) ? parts.rest : undefined;
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
    if (!isLocalizedPage(path)) return href;
    const suffix = end === -1 ? "" : href.slice(end);
    return `/${locale}${path === "/" ? "" : path}${suffix}`;
}

/** The page at `pathname` in `locale`. An English-only page has no translation, so it opens that language's home. */
export function languageHref(pathname: string, search: string, locale: string): string {
    const path = unlocalizedPath(pathname);
    const target = isLocalizedPage(path) || locale === DEFAULT_LOCALE ? path : "/";
    return localizedHref(`${target}${search}`, locale);
}

export interface Alternate {
    hreflang: string;
    path: string;
}

/** Every language's address for a localized page, with English as the default; none for an English-only page. */
export function alternates(pathname: string): Alternate[] {
    const path = unlocalizedPath(pathname);
    if (!isLocalizedPage(path)) return [];
    return [
        { hreflang: DEFAULT_LOCALE, path },
        ...WEB_LOCALES.map((locale) => ({ hreflang: locale, path: localizedHref(path, locale) })),
        { hreflang: "x-default", path },
    ];
}
