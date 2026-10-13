// Regenerates apps/desktop/src/lib/generated/dependency-licenses.json from Cargo (via cargo-about) and pnpm.
// Requires: cargo install cargo-about --locked --features cli
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "apps", "desktop");
const outFile = join(root, "src", "lib", "generated", "dependency-licenses.json");
const isWin = process.platform === "win32";

// Packages that are devDependencies but end up inside the shipped bundle.
const BUNDLED_DEV = ["svelte", "tailwindcss", "tw-animate-css"];

const normalize = (t) =>
    t
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+$/gm, "")
        .trim();

function rustPackages() {
    const file = join(tmpdir(), "deadlock-plus-rust-licenses.json");
    execFileSync("cargo", ["about", "generate", "--format", "json", "-o", file], {
        cwd: join(root, "src-tauri"),
        stdio: ["ignore", "ignore", "inherit"],
    });
    const data = JSON.parse(readFileSync(file, "utf8"));
    const entries = [];
    for (const lic of data.licenses) {
        for (const { crate } of lic.used_by) {
            if (crate.name === "deadlock-plus" || crate.name.startsWith("dp-")) continue;
            entries.push({
                label: lic.name,
                text: normalize(lic.text),
                pkg: {
                    name: crate.name,
                    version: crate.version,
                    source: "rust",
                    url: crate.repository ?? crate.homepage ?? undefined,
                },
            });
        }
    }
    return entries;
}

function resolveDep(fromDir, name) {
    for (let dir = fromDir; ; dir = dirname(dir)) {
        const candidate = join(dir, "node_modules", name);
        if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
        if (dirname(dir) === dir) return null;
        // pnpm keeps a package's own dependencies as siblings of it.
        const sibling = join(dir, name);
        if (dir.endsWith("node_modules") && existsSync(join(sibling, "package.json"))) return realpathSync(sibling);
    }
}

function npmPackages() {
    const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const seeds = [...Object.keys(rootPkg.dependencies ?? {}), ...BUNDLED_DEV];
    const seen = new Map();
    const queue = seeds.map((n) => resolveDep(root, n)).filter(Boolean);
    while (queue.length) {
        const dir = queue.pop();
        if (seen.has(dir)) continue;
        const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
        seen.set(dir, pkg);
        const deps = { ...pkg.dependencies, ...pkg.optionalDependencies };
        for (const name of Object.keys(deps)) {
            const found = resolveDep(dir, name);
            if (found) queue.push(found);
        }
    }
    const entries = [];
    for (const [dir, pkg] of seen) {
        // Workspace packages are this project's own code, not third-party.
        if (pkg.name?.startsWith("@deadlock-plus/")) continue;
        const license = typeof pkg.license === "string" ? pkg.license : (pkg.license?.type ?? "unknown");
        const url = typeof pkg.repository === "string" ? pkg.repository : (pkg.repository?.url ?? pkg.homepage);
        const base = {
            name: pkg.name,
            version: pkg.version,
            source: "npm",
            url: url?.replace(/^git\+/, "").replace(/\.git$/, ""),
        };
        const files = readdirSync(dir).filter(
            (f) => /^(licen[sc]e|copying|notice)/i.test(f) && statSync(join(dir, f)).isFile(),
        );
        if (files.length === 0) entries.push({ label: license, text: null, pkg: base });
        for (const f of files)
            entries.push({ label: license, text: normalize(readFileSync(join(dir, f), "utf8")), pkg: base });
    }
    return entries;
}

const groups = new Map();
for (const e of [...rustPackages(), ...npmPackages()]) {
    const key = e.text ?? `declared:${e.label}`;
    const g = groups.get(key) ?? { labels: new Set(), text: e.text, packages: new Map() };
    g.labels.add(e.label);
    g.packages.set(`${e.pkg.source}:${e.pkg.name}@${e.pkg.version}`, e.pkg);
    groups.set(key, g);
}

const result = {
    groups: [...groups.values()]
        .map((g) => ({
            title: [...g.labels].sort().join(" / "),
            text: g.text,
            packages: [...g.packages.values()].sort(
                (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
            ),
        }))
        .sort((a, b) => b.packages.length - a.packages.length || a.title.localeCompare(b.title)),
};

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(result));
const total = new Set(result.groups.flatMap((g) => g.packages.map((p) => `${p.source}:${p.name}@${p.version}`))).size;
console.log(`${total} packages in ${result.groups.length} licence groups -> ${outFile}`);
