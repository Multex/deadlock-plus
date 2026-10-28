import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Crowdin's i18next parser files every plural form under the base key.
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const PLACEHOLDER = /\{[^{}]+\}/g;

/** Every string of one English catalog, named by the identifier Crowdin gives it. */
export function stringEntries(tree, file, prefix = "") {
    return Object.entries(tree).flatMap(([name, value]) => {
        const key = prefix ? `${prefix}.${name}` : name;
        if (typeof value === "string") return [{ identifier: key.replace(PLURAL_SUFFIX, ""), file, text: value }];
        return value && typeof value === "object" ? stringEntries(value, file, key) : [];
    });
}

/** The strings of `locales/<area>/en.json` for every area folder that has one, or for `areas` only. */
export function readSourceStrings(localesDir, areas) {
    return readdirSync(localesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(path.join(localesDir, entry.name, "en.json")))
        .map((entry) => entry.name)
        .filter((area) => !areas || areas.includes(area))
        .sort()
        .flatMap((area) => {
            const json = JSON.parse(readFileSync(path.join(localesDir, area, "en.json"), "utf8"));
            return stringEntries(json, `locales/${area}/en.json`);
        });
}

const norm = (s) => s.replace(/\s+/g, " ").trim();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Plain data (it is sent into the page as JSON) that `matchText` looks rendered text up in. */
export function buildMatcher(entries) {
    const exact = {};
    const templates = new Map();
    for (const { identifier, file, text: raw } of entries) {
        const text = norm(raw);
        const id = { identifier, file };
        if (PLACEHOLDER.test(text)) {
            PLACEHOLDER.lastIndex = 0;
            // A template that is all placeholders would match any text at all.
            if (text.replace(PLACEHOLDER, "").replace(/[^\p{L}\p{N}]/gu, "").length < 2) continue;
            const source = `^${text.split(PLACEHOLDER).map(escape).join("(.+?)")}$`;
            templates.set(`${file}#${identifier}#${source}`, { source, ...id });
        } else if (text.length >= 2) {
            const list = (exact[text] ??= []);
            if (!list.some((c) => c.file === file && c.identifier === identifier)) list.push(id);
        }
    }
    return { exact, templates: [...templates.values()] };
}

/**
 * The identifiers whose English text renders as `text`, or null. More than one means the text is ambiguous.
 * It runs inside the page too, from its source, so it uses nothing from outside its own body.
 */
export function matchText(matcher, text) {
    const t = text.replace(/\s+/g, " ").trim();
    if (t.length < 2) return null;
    if (Object.hasOwn(matcher.exact, t)) return matcher.exact[t];
    const hits = [];
    for (const template of matcher.templates) {
        if (!template.compiled) {
            Object.defineProperty(template, "compiled", {
                value: new RegExp(template.source, "su"),
                enumerable: false,
            });
        }
        if (!template.compiled.test(t)) continue;
        if (!hits.some((h) => h.file === template.file && h.identifier === template.identifier)) {
            hits.push({ identifier: template.identifier, file: template.file });
        }
    }
    return hits.length ? hits : null;
}
