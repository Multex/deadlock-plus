import { command } from "./tauri";
import { prefs } from "./prefs";

export type Catalog = { [key: string]: string | Catalog };
type Params = Record<string, string | number>;

export const DEFAULT_LOCALE = "en";

// Each area file holds whole top-level namespaces and no namespace sits in two areas, so a shallow merge
// gives the same catalog as one file per locale.
const mergeAreas = (areas: Catalog[]): Catalog => Object.assign({}, ...areas);

const localeOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1, -".json".length);

export const en: Catalog = mergeAreas(
    Object.values(
        import.meta.glob<Catalog>(["../../../../../locales/*/en.json", "!../../../../../locales/dispatch/*.json"], {
            eager: true,
            import: "default",
        }),
    ),
);

const areaLoaders: Record<string, (() => Promise<Catalog>)[]> = {};
for (const [path, load] of Object.entries(
    import.meta.glob<Catalog>(
        [
            "../../../../../locales/*/*.json",
            "!../../../../../locales/*/en.json",
            "!../../../../../locales/dispatch/*.json",
        ],
        { import: "default" },
    ),
)) {
    (areaLoaders[localeOf(path)] ??= []).push(load);
}

const loaders: Record<string, () => Promise<Catalog>> = Object.fromEntries(
    Object.entries(areaLoaders).map(([locale, areas]) => [
        locale,
        async () => mergeAreas(await Promise.all(areas.map((load) => load()))),
    ]),
);

const byLocale = (files: Record<string, () => Promise<Catalog>>): Record<string, () => Promise<Catalog>> =>
    Object.fromEntries(Object.entries(files).map(([path, load]) => [localeOf(path), load]));

/** Areas left out of the startup catalog, by locale; whatever reads one awaits `i18n.namespace` first. */
const lazyAreas: Record<string, Record<string, () => Promise<Catalog>>> = {
    dispatch: byLocale(import.meta.glob<Catalog>("../../../../../locales/dispatch/*.json", { import: "default" })),
};

if (import.meta.env.DEV) {
    loaders["en-XA"] = async () => {
        const lazy = await Promise.all(Object.values(lazyAreas).map((area) => area[DEFAULT_LOCALE]()));
        return (await import("./i18n-pseudo")).pseudoLocalize(mergeAreas([en, ...lazy]));
    };
}

export const SUPPORTED_LOCALES: readonly string[] = [DEFAULT_LOCALE, ...Object.keys(loaders)];

export function lookup(catalog: Catalog, key: string): string | undefined {
    let node: string | Catalog | undefined = catalog;
    for (const part of key.split(".")) {
        if (typeof node !== "object") return undefined;
        node = node[part];
    }
    return typeof node === "string" && node.trim() !== "" ? node : undefined;
}

export function interpolate(template: string, params?: Params): string {
    return template.replace(/\{(\w+)\}/g, (hole, name) => (params && name in params ? String(params[name]) : hole));
}

function canonicalTag(tag: string): string {
    const [base, ...rest] = tag.split("-");
    if (base.toLowerCase() !== "zh") return tag;
    return rest.some((part) => /^(hant|tw|hk|mo)$/i.test(part)) ? "zh-TW" : "zh-CN";
}

export function resolveLocale(pref: string, system: string, supported: readonly string[]): string {
    const wanted = canonicalTag(pref === "system" ? system : pref);
    if (supported.includes(wanted)) return wanted;
    const base = wanted.split("-")[0];
    return supported.includes(base) ? base : DEFAULT_LOCALE;
}

export function chainFor(locale: string, catalogs: Record<string, Catalog>): Catalog[] {
    const order = [locale, locale.split("-")[0], DEFAULT_LOCALE];
    const chain: Catalog[] = [];
    for (const code of order) {
        const catalog = catalogs[code];
        if (catalog && !chain.includes(catalog)) chain.push(catalog);
    }
    return chain;
}

class I18n {
    locale = $state(DEFAULT_LOCALE);
    catalogs = $state.raw<Record<string, Catalog>>({ en });

    reset(catalogs: Record<string, Catalog>, locale: string): void {
        this.catalogs = catalogs;
        this.locale = locale;
        this.namespaces.clear();
    }

    private namespaces = new Map<string, Promise<void>>();

    /** Adds a lazy area to English and every loaded locale. Its keys read as raw keys until this settles. */
    namespace(name: string): Promise<void> {
        let loading = this.namespaces.get(name);
        if (!loading) {
            loading = this.mergeArea(name, Object.keys(this.catalogs));
            loading.catch(() => this.namespaces.delete(name));
            this.namespaces.set(name, loading);
        }
        return loading;
    }

    private async mergeArea(name: string, codes: readonly string[]): Promise<void> {
        const area = lazyAreas[name];
        const parts = await Promise.all(
            codes.filter((code) => area[code]).map(async (code) => [code, await area[code]()] as const),
        );
        const catalogs = { ...this.catalogs };
        for (const [code, part] of parts) if (catalogs[code]) catalogs[code] = { ...catalogs[code], ...part };
        this.catalogs = catalogs;
    }

    private localeListeners = new Set<(locale: string) => void>();

    /** Runs after the locale changes through `setLocale`. Returns the unsubscribe. */
    onLocaleChange(fn: (locale: string) => void): () => void {
        this.localeListeners.add(fn);
        return () => this.localeListeners.delete(fn);
    }

    setLocale(locale: string): void {
        const changed = this.locale !== locale;
        this.locale = locale;
        if (typeof document !== "undefined") document.documentElement.lang = locale;
        if (changed) for (const fn of this.localeListeners) fn(locale);
    }

    async setLanguage(pref: string): Promise<string> {
        const system = typeof navigator === "undefined" ? DEFAULT_LOCALE : navigator.language;
        const locale = resolveLocale(pref, system, SUPPORTED_LOCALES);
        await this.load(locale);
        prefs.setString("language", pref);
        this.setLocale(locale);
        command("set_language", { locale }).catch(() => {});
        return locale;
    }

    async preload(locales: readonly string[]): Promise<void> {
        for (const locale of locales) await this.load(locale);
    }

    private async load(locale: string): Promise<void> {
        const base = locale.split("-")[0];
        for (const code of new Set([locale, base])) {
            if (this.catalogs[code] || !loaders[code]) continue;
            const catalog = await loaders[code]();
            this.catalogs = { ...this.catalogs, [code]: catalog };
            for (const name of this.namespaces.keys()) await this.mergeArea(name, [code]);
        }
    }

    translate(key: string, params?: Params): string {
        for (const catalog of chainFor(this.locale, this.catalogs)) {
            const template = lookup(catalog, key);
            if (template !== undefined) return interpolate(template, params);
        }
        if (import.meta.env?.DEV) console.warn(`[i18n] missing key: ${key}`);
        return key;
    }

    translatePlural(key: string, count: number, params?: Params): string {
        const form = new Intl.PluralRules(this.locale).select(count);
        const withCount = { count: new Intl.NumberFormat(this.locale).format(count), ...params };
        for (const catalog of chainFor(this.locale, this.catalogs)) {
            const template = lookup(catalog, `${key}_${form}`) ?? lookup(catalog, `${key}_other`);
            if (template !== undefined) return interpolate(template, withCount);
        }
        if (import.meta.env?.DEV) console.warn(`[i18n] missing key: ${key}_${form}`);
        return key;
    }
}

export const i18n = new I18n();

export function t(key: string, params?: Params): string {
    return i18n.translate(key, params);
}

export function tn(key: string, count: number, params?: Params): string {
    return i18n.translatePlural(key, count, params);
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(i18n.locale, options).format(value);
}

export function formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(i18n.locale, options).format(value);
}

export async function initLanguage(): Promise<string> {
    return i18n.setLanguage(prefs.getString("language", "system"));
}
