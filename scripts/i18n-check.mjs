import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const KEY_CALL = /(?<![\w$])(tn?)\(\s*(["'])([\w.]+)\2/g;
const TEMPLATE_KEY_CALL = /(?<![\w$])tn?\(\s*`([^`$]+)\$\{/g;
const STRING_LITERAL = /(["'])([\w.]+)\1/g;
const PLACEHOLDER = /\{(\w+)\}/g;
const NAMESPACE_CONST = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(["'])(\w+(?:\.\w+)+)\2/g;
const NAMESPACE_TEMPLATE = /`\$\{([A-Za-z_$][\w$]*)\}\.\$\{/g;
const RUST_KEY_PREFIXES = ["errors.", "tray.", "notifications.", "storage.owners.", "storage.kinds."];

export function flatten(node, prefix = "") {
    const out = {};
    for (const [name, value] of Object.entries(node)) {
        const key = prefix ? `${prefix}.${name}` : name;
        if (typeof value === "string") out[key] = value;
        else Object.assign(out, flatten(value, key));
    }
    return out;
}

export function extractKeys(source) {
    return [...source.matchAll(KEY_CALL)].map((m) => ({ key: m[3], plural: m[1] === "tn" }));
}

export function extractTemplatePrefixes(source) {
    return [...source.matchAll(TEMPLATE_KEY_CALL)].map((m) => m[1]);
}

// Keys built as `${NS}.${key}` from a `const NS = "a.b"` in the same file count everything under `a.b.` as used.
export function extractNamespacePrefixes(source) {
    const namespaces = new Map([...source.matchAll(NAMESPACE_CONST)].map((m) => [m[1], m[3]]));
    const prefixes = [...source.matchAll(NAMESPACE_TEMPLATE)]
        .filter((m) => namespaces.has(m[1]))
        .map((m) => `${namespaces.get(m[1])}.`);
    return [...new Set(prefixes)];
}

export function extractKeyLiterals(source, known) {
    return [...source.matchAll(STRING_LITERAL)].map((m) => m[2]).filter((text) => known.has(text));
}

const placeholders = (text) => [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))].sort().join(",");

export function checkCatalogs(catalogs, used, referenced = { literals: new Set(), prefixes: [] }) {
    const errors = [];
    const warnings = [];
    const en = flatten(catalogs.en);

    // Crowdin's i18next parser makes any key with a plural suffix a plural form, so a lone one exports blank.
    for (const key of Object.keys(en)) {
        const base = key.replace(PLURAL_SUFFIX, "");
        if (base !== key && !(`${base}_one` in en && `${base}_other` in en))
            errors.push(`en: ${key} ends in a plural suffix outside a ${base}_one/${base}_other pair`);
    }

    for (const { file, key, plural } of used) {
        if (plural) {
            if (!(`${key}_other` in en)) errors.push(`${file} uses plural ${key} but en has no ${key}_other`);
        } else if (!(key in en)) {
            errors.push(`${file} uses missing key ${key}`);
        }
    }

    for (const [locale, catalog] of Object.entries(catalogs)) {
        if (locale === "en") continue;
        for (const [key, text] of Object.entries(flatten(catalog))) {
            if (text.trim() === "") continue;
            const reference =
                en[key] ?? (PLURAL_SUFFIX.test(key) ? en[key.replace(PLURAL_SUFFIX, "_other")] : undefined);
            if (reference === undefined) {
                errors.push(`${locale}: ${key} is not in en`);
                continue;
            }
            // Plural categories differ by language (Russian "one" also covers 21), so a form may show
            // a {count} its en form leaves out. `tn` always passes it.
            const expected =
                PLURAL_SUFFIX.test(key) && !reference.includes("{count}") ? `${reference}{count}` : reference;
            const actual = expected === reference ? text : `${text}{count}`;
            if (placeholders(actual) !== placeholders(expected))
                errors.push(`${locale}: ${key} placeholders differ from en`);
        }
    }

    const usedKeys = new Set(used.map((u) => u.key));
    for (const key of Object.keys(en)) {
        if (RUST_KEY_PREFIXES.some((p) => key.startsWith(p))) continue;
        const base = key.replace(PLURAL_SUFFIX, "");
        const isUsed =
            usedKeys.has(key) ||
            usedKeys.has(base) ||
            referenced.literals.has(key) ||
            referenced.literals.has(base) ||
            referenced.prefixes.some((p) => key.startsWith(p));
        if (!isUsed) warnings.push(`unused en key ${key}`);
    }
    return { errors, warnings };
}

// The app and Crowdin both treat `locales/<area>/<locale>.json` as slices of one catalog per locale, which only
// holds while every namespace lives in exactly one area and every locale agrees with en on which.
export function mergeAreas(files) {
    const errors = [];
    const catalogs = {};
    const homes = {};
    for (const { area, locale, catalog } of files) {
        const home = (homes[locale] ??= {});
        for (const [namespace, value] of Object.entries(catalog)) {
            if (home[namespace]) errors.push(`${locale}: ${namespace} is in both ${home[namespace]} and ${area}`);
            home[namespace] = area;
            (catalogs[locale] ??= {})[namespace] = value;
        }
    }
    for (const [locale, home] of Object.entries(homes)) {
        if (locale === "en") continue;
        for (const [namespace, area] of Object.entries(home)) {
            const english = homes.en?.[namespace];
            if (english && english !== area)
                errors.push(`${locale}: ${namespace} is in ${area} but en keeps it in ${english}`);
        }
    }
    return { catalogs, errors };
}

export const NOTES_FILE = "en.notes.json";

export const isCatalogFile = (name) => name.endsWith(".json") && !name.endsWith(".notes.json");

// Crowdin shows one context per plural set, so a note covers the base key, never a single `_one`/`_other` form.
export function checkNotes(area, en, notes) {
    const keys = new Set(Object.keys(flatten(en)).map((key) => key.replace(PLURAL_SUFFIX, "")));
    const written = flatten(notes);
    const errors = [];
    for (const key of keys)
        if (!written[key]?.trim()) errors.push(`${area}: ${key} has no translator note in ${NOTES_FILE}`);
    for (const key of Object.keys(written))
        if (!keys.has(key)) errors.push(`${area}: ${NOTES_FILE} has a note for ${key}, which en.json does not have`);
    return errors;
}

function readAreaNotes(localesDir) {
    return readdirSync(localesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap(({ name: area }) => {
            const read = (file) => {
                const full = path.join(localesDir, area, file);
                return existsSync(full) ? JSON.parse(readFileSync(full, "utf8")) : {};
            };
            return checkNotes(area, read("en.json"), read(NOTES_FILE));
        });
}

function readAreas(localesDir) {
    return readdirSync(localesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap(({ name: area }) =>
            readdirSync(path.join(localesDir, area))
                .filter(isCatalogFile)
                .map((f) => ({
                    area,
                    locale: path.basename(f, ".json"),
                    catalog: JSON.parse(readFileSync(path.join(localesDir, area, f), "utf8")),
                })),
        );
}

function walk(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === "generated" ? [] : walk(full);
        return /\.(ts|svelte)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
    });
}

// `ipc-types` is generated from Rust and holds no translation key.
export function sourceDirs(packageNames) {
    return [
        "apps/desktop/src",
        ...packageNames.filter((name) => name !== "ipc-types").map((name) => `packages/${name}/src`),
    ];
}

// The website ships its own catalog, so its keys are checked against its own code and the app's against the app's.
export const WEB_AREA = "web";

function checkSources(files, sources) {
    const { catalogs, errors: areaErrors } = mergeAreas(files);
    if (!catalogs.en) return { errors: areaErrors, warnings: [] };
    const used = sources.flatMap(({ file, text }) => extractKeys(text).map((k) => ({ ...k, file })));
    const known = new Set(Object.keys(flatten(catalogs.en)).flatMap((key) => [key, key.replace(PLURAL_SUFFIX, "")]));
    const referenced = {
        literals: new Set(sources.flatMap(({ text }) => extractKeyLiterals(text, known))),
        prefixes: sources.flatMap(({ text }) => [...extractTemplatePrefixes(text), ...extractNamespacePrefixes(text)]),
    };
    const checked = checkCatalogs(catalogs, used, referenced);
    return { errors: [...areaErrors, ...checked.errors], warnings: checked.warnings };
}

/** `sources.app` and `sources.web` are `{ file, text }` lists for the app's and the website's code. */
export function checkAreas(files, sources) {
    const app = checkSources(
        files.filter((f) => f.area !== WEB_AREA),
        sources.app,
    );
    const web = checkSources(
        files.filter((f) => f.area === WEB_AREA),
        sources.web,
    );
    const tag = (line) => `${WEB_AREA}: ${line}`;
    return { errors: [...app.errors, ...web.errors.map(tag)], warnings: [...app.warnings, ...web.warnings.map(tag)] };
}

function readSources(root, dirs) {
    return dirs
        .flatMap((dir) => walk(path.join(root, dir)))
        .map((full) => ({
            file: path.relative(root, full).replaceAll("\\", "/"),
            text: readFileSync(full, "utf8"),
        }));
}

function main() {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const packageNames = readdirSync(path.join(root, "packages"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(path.join(root, "packages", entry.name, "src")))
        .map((entry) => entry.name);
    const { errors, warnings } = checkAreas(readAreas(path.join(root, "locales")), {
        app: readSources(root, sourceDirs(packageNames)),
        web: readSources(root, ["apps/web/src"]),
    });
    errors.push(...readAreaNotes(path.join(root, "locales")));
    for (const line of warnings) console.warn(`warning: ${line}`);
    for (const line of errors) console.error(line);
    if (errors.length) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
