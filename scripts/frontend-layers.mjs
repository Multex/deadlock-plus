import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// [file relative to src/, rule]. Entries may only be removed; a fixed file must be dropped from here.
export const LAYER_ALLOWLIST = [];

const TEST_FILE = /\.(test|spec)\.[jt]s$/;
const TAURI_ALLOWED = /^lib\/core\/|^lib\/features\/[^/]+\/api\.ts$/;
const IMPORT_PATTERNS = [
    /\b(?:import|export)\b[^'"`;()]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

export function extractImports(source) {
    const found = [];
    for (const pattern of IMPORT_PATTERNS) {
        for (const match of source.matchAll(pattern)) found.push([match.index, match[1]]);
    }
    return found.sort((a, b) => a[0] - b[0]).map(([, specifier]) => specifier);
}

function resolveSpecifier(file, specifier) {
    if (specifier.startsWith("$lib/")) return `lib/${specifier.slice(5)}`;
    if (specifier.startsWith(".")) return path.posix.join(path.posix.dirname(file), specifier);
    return specifier;
}

function rulesBroken(file, specifier) {
    const target = resolveSpecifier(file, specifier);
    const broken = [];
    if (specifier.startsWith("@tauri-apps/") && !TEST_FILE.test(file) && !TAURI_ALLOWED.test(file)) {
        broken.push(["tauri", "only lib/core and lib/features/*/api.ts may use @tauri-apps"]);
    }
    const intoFeatures = target.startsWith("lib/features/") || target === "lib/features";
    if (intoFeatures && file.startsWith("lib/core/")) {
        broken.push(["no-features", "lib/core must not import lib/features"]);
    }
    if (intoFeatures && file.startsWith("lib/shell/") && target !== "lib/features/registry") {
        broken.push(["shell-registry", "lib/shell may only reach features through lib/features/registry"]);
    }
    return broken;
}

export function checkLayers(files, allowlist = LAYER_ALLOWLIST) {
    const violations = [];
    const allowed = new Set(allowlist.map(([file, rule]) => `${file}\0${rule}`));
    const seen = new Set();

    for (const { file, imports } of files) {
        for (const specifier of imports) {
            for (const [rule, why] of rulesBroken(file, specifier)) {
                const key = `${file}\0${rule}`;
                if (allowed.has(key)) {
                    seen.add(key);
                    continue;
                }
                violations.push(`${file} imports ${specifier}: ${why}`);
            }
        }
    }

    for (const [file, rule] of allowlist) {
        if (!seen.has(`${file}\0${rule}`)) {
            violations.push(`stale allow-list entry ${file} (${rule}): no such violation`);
        }
    }

    return violations;
}

const APP_ONLY = /^(@sveltejs\/|@tauri-apps\/|\$lib\/|\$app\/)/;
const SVELTE = /^svelte(\/|$)/;
const UI_PACKAGE = /^@deadlock-plus\/ui(\/|$)/;
const NOT_PLAIN = new Set(["ui", "ipc-types"]);

// `files` are named from the repository root.
function packageViolations(files, banned, why) {
    const violations = [];
    for (const { file, imports } of files) {
        for (const specifier of imports) {
            const intoApp =
                specifier.startsWith(".") && path.posix.join(path.posix.dirname(file), specifier).startsWith("apps/");
            if (banned.some((pattern) => pattern.test(specifier))) {
                violations.push(`${file} imports ${specifier}: ${why}`);
            } else if (intoApp) {
                violations.push(`${file} imports ${specifier}: a package may not import from apps/`);
            }
        }
    }
    return violations;
}

// Every folder in packages/ holds plain code, except the Svelte components and the generated IPC types.
export function plainPackages(names) {
    return names.filter((name) => !NOT_PLAIN.has(name));
}

// A plain package must load in plain Node, and must not reach back into the app that uses it. An app alias is
// also the only way to an app's key-value store and translation catalog.
export function checkPackageLayers(files) {
    return packageViolations(
        files,
        [SVELTE, UI_PACKAGE, APP_ONLY],
        "a package may not use Svelte, SvelteKit, Tauri or app aliases",
    );
}

// The UI package is Svelte components shared by several apps. An app alias would tie it to one of them, and is
// also the only way to the desktop app's translation catalog.
export function checkUiPackageLayers(files) {
    return packageViolations(files, [APP_ONLY], "the UI package may not use SvelteKit, Tauri or app aliases");
}

function* walk(dir, sources) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== "node_modules") yield* walk(full, sources);
        } else if (sources.test(entry.name)) yield full;
    }
}

export function scan(srcDir, sources = /\.(ts|svelte)$/) {
    return [...walk(srcDir, sources)]
        .map((full) => path.relative(srcDir, full).replaceAll("\\", "/"))
        .filter((file) => !file.startsWith("lib/generated/"))
        .map((file) => ({ file, imports: extractImports(readFileSync(path.join(srcDir, file), "utf8")) }));
}

function main() {
    const srcDir = fileURLToPath(new URL("../apps/desktop/src", import.meta.url));
    const packagesDir = fileURLToPath(new URL("../packages", import.meta.url));
    const uiDir = path.join(packagesDir, "ui/src");
    const folders = readdirSync(packagesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    const plainFiles = plainPackages(folders).flatMap((name) =>
        scan(path.join(packagesDir, name), /\.(ts|js|mjs)$/).map(({ file, imports }) => ({
            file: `packages/${name}/${file}`,
            imports,
        })),
    );
    const uiFiles = scan(uiDir).map(({ file, imports }) => ({ file: `packages/ui/src/${file}`, imports }));
    const violations = [
        ...checkLayers(scan(srcDir)),
        ...checkPackageLayers(plainFiles),
        ...checkUiPackageLayers(uiFiles),
    ];
    if (violations.length) {
        for (const line of violations) console.error(line);
        process.exit(1);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
