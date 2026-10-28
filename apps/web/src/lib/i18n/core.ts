export type Catalog = { [key: string]: string | Catalog };
export type Params = Record<string, string | number>;

export const DEFAULT_LOCALE = "en";

export interface Translator {
    locale: string;
    t: (key: string, params?: Params) => string;
    tn: (key: string, count: number, params?: Params) => string;
}

/** A blank string is how Crowdin exports an untranslated key, so it counts as missing. */
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

/** The text before and after `{name}`, for a sentence whose hole is a link or bold word. */
export function around(template: string, name: string): [string, string] {
    const hole = `{${name}}`;
    const at = template.indexOf(hole);
    return at === -1 ? [template, ""] : [template.slice(0, at), template.slice(at + hole.length)];
}

function chain(locale: string, catalogs: Record<string, Catalog>): Catalog[] {
    const codes = [...new Set([locale, locale.split("-")[0] ?? locale, DEFAULT_LOCALE])];
    return codes.flatMap((code) => (catalogs[code] ? [catalogs[code]] : []));
}

export function createTranslator(locale: string, catalogs: Record<string, Catalog>): Translator {
    const order = chain(locale, catalogs);
    const find = (key: string) => {
        for (const catalog of order) {
            const template = lookup(catalog, key);
            if (template !== undefined) return template;
        }
        return undefined;
    };
    const rules = new Intl.PluralRules(locale);
    const numbers = new Intl.NumberFormat(locale);
    return {
        locale,
        t: (key, params) => {
            const template = find(key);
            return template === undefined ? key : interpolate(template, params);
        },
        tn: (key, count, params) => {
            const template = find(`${key}_${rules.select(count)}`) ?? find(`${key}_other`);
            return template === undefined ? key : interpolate(template, { count: numbers.format(count), ...params });
        },
    };
}
