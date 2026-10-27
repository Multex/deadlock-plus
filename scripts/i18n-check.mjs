import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const KEY_CALL = /(?<![\w$])(tn?)\(\s*(["'])([\w.]+)\2/g;
const TEMPLATE_KEY_CALL = /(?<![\w$])tn?\(\s*`([^`$]+)\$\{/g;
const DOTTED_TEMPLATE = /`(\w+(?:\.\w+)+\.[^`]*\$\{[^`]*)`/g;
const INTERPOLATION = /\$\{[^}]*\}/;
const STRING_LITERAL =/(["'])([\w.]+)\1/g;
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

// A template like `a.b.${x}.${y}_${n}` outside a t call builds whole keys. Each interpolation stands for one word
// segment, so keys no value can produce stay flagged.
export function extractTemplatePatterns(source) {
    return [...source.matchAll(DOTTED_TEMPLATE)].map((m) => {
        const body = m[1]
            .split(INTERPOLATION)
            .map((part) => part.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&"))
            .join("\\w+");
        return new RegExp(`^${body}$`);
    });
}

export function extractKeyLiterals(source, known) {
    return [...source.matchAll(STRING_LITERAL)].map((m) => m[2]).filter((text) => known.has(text));
}

const placeholders = (text) => [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))].sort().join(",");

export function checkCatalogs(catalogs, used, referenced = { literals: new Set(), prefixes: [], patterns: [] }) {
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
            referenced.prefixes.some((p) => key.startsWith(p)) ||
            referenced.patterns.some((p) => p.test(key));
        if (!isUsed) warnings.push(`unused en key ${key}`);
    }
    return { errors, warnings };
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

function main() {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const localesDir = path.join(root, "locales");
    const catalogs = Object.fromEntries(
        readdirSync(localesDir)
            .filter((f) => f.endsWith(".json"))
            .map((f) => [path.basename(f, ".json"), JSON.parse(readFileSync(path.join(localesDir, f), "utf8"))]),
    );
    const packageNames = readdirSync(path.join(root, "packages"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(path.join(root, "packages", entry.name, "src")))
        .map((entry) => entry.name);
    const sources = sourceDirs(packageNames)
        .flatMap((dir) => walk(path.join(root, dir)))
        .map((full) => ({
            file: path.relative(root, full).replaceAll("\\", "/"),
            text: readFileSync(full, "utf8"),
        }));
    const used = sources.flatMap(({ file, text }) => extractKeys(text).map((k) => ({ ...k, file })));
    const known = new Set(Object.keys(flatten(catalogs.en)).flatMap((key) => [key, key.replace(PLURAL_SUFFIX, "")]));
    const referenced = {
        literals: new Set(sources.flatMap(({ text }) => extractKeyLiterals(text, known))),
        prefixes: sources.flatMap(({ text }) => [...extractTemplatePrefixes(text), ...extractNamespacePrefixes(text)]),
        patterns: sources.flatMap(({ text }) => extractTemplatePatterns(text)),
    };
    const { errors, warnings } = checkCatalogs(catalogs, used, referenced);
    for (const line of warnings) console.warn(`warning: ${line}`);
    for (const line of errors) console.error(line);
    if (errors.length) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
