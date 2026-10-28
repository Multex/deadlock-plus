import { catalogsFor } from "$lib/i18n/catalogs";
import { localeOf } from "$lib/i18n/routes";
import type { LayoutLoad } from "./$types";

// Universal, not server-only: the catalog is a script chunk the browser caches, not data inlined into every page.
export const load: LayoutLoad = async ({ url }) => {
    const locale = localeOf(url.pathname);
    return { locale, catalogs: await catalogsFor(locale) };
};
