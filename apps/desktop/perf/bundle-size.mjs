// Per-route JS/CSS weight of a demo build, read from the Vite manifest.
// Usage, from apps/desktop after `DEMO_ID=perf node e2e/support/demo.mjs build`:
//   DEMO_ID=perf node perf/bundle-size.mjs [--json] [--check]
// `--check` exits 1 when a route goes over its gzip budget in perf/budgets.json.
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const demoDir = process.env.DEMO_ID ? `demo-${process.env.DEMO_ID}` : "demo";
const out = path.resolve(`.svelte-kit/${demoDir}/output/client`);
const generated = path.resolve(`.svelte-kit/${demoDir}/generated/client-optimized/nodes`);
const manifest = JSON.parse(readFileSync(path.join(out, ".vite/manifest.json"), "utf8"));
const budgets = JSON.parse(readFileSync(new URL("./budgets.json", import.meta.url), "utf8")).bundle;

const sizes = new Map();
function measure(file) {
    if (!sizes.has(file)) {
        const bytes = readFileSync(path.join(out, file));
        sizes.set(file, {
            raw: bytes.length,
            gzip: gzipSync(bytes, { level: 9 }).length,
            brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
        });
    }
    return sizes.get(file);
}

/** Files a key loads before it runs: its own file, its static imports and their CSS. Dynamic imports are left out. */
function closure(keys) {
    const files = new Set();
    const seen = new Set();
    const walk = (key) => {
        if (seen.has(key)) return;
        seen.add(key);
        const chunk = manifest[key];
        files.add(chunk.file);
        for (const css of chunk.css ?? []) files.add(css);
        for (const next of chunk.imports ?? []) walk(next);
    };
    keys.forEach(walk);
    return files;
}

function total(files) {
    const sum = { js: { raw: 0, gzip: 0, brotli: 0 }, css: { raw: 0, gzip: 0, brotli: 0 } };
    for (const file of files) {
        const kind = file.endsWith(".css") ? "css" : "js";
        const size = measure(file);
        for (const unit of ["raw", "gzip", "brotli"]) sum[kind][unit] += size[unit];
    }
    return sum;
}

const routeOf = new Map();
for (const key of Object.keys(manifest)) {
    const match = /client-optimized\/nodes\/(\d+)\.js$/.exec(key);
    if (!match) continue;
    const source = readFileSync(path.join(generated, `${match[1]}.js`), "utf8");
    const file = /src\/routes\/([^"']*\+(?:page|layout|error)\.svelte)/.exec(source)?.[1];
    if (file) routeOf.set(key, file);
}

const entryKeys = Object.keys(manifest).filter((key) => /entry\/(start|app)\b/.test(manifest[key].file));
const rootLayout = [...routeOf].find(([, file]) => file === "+layout.svelte")[0];
const appLayout = [...routeOf].find(([, file]) => file === "(app)/+layout.svelte")[0];
const shell = closure([...entryKeys, rootLayout, appLayout]);

const rows = [{ route: "shell (entry + root and (app) layouts)", ...total(shell) }];
for (const [key, file] of routeOf) {
    if (!file.endsWith("+page.svelte")) continue;
    const layouts = [...routeOf].filter(
        ([, f]) =>
            f.endsWith("+layout.svelte") && file.startsWith(path.posix.dirname(f) + "/") && f !== "+layout.svelte",
    );
    const own = [...closure([key, ...layouts.map(([k]) => k)])].filter((f) => !shell.has(f));
    rows.push({ route: file.replace(/\/?\+page\.svelte$/, "") || "(app) home", ...total(own) });
}
rows.sort((a, b) => b.js.gzip + b.css.gzip - (a.js.gzip + a.css.gzip));

const chunks = [...new Set(Object.values(manifest).map((chunk) => chunk.file))]
    .filter((file) => /\.(js|css)$/.test(file))
    .map((file) => ({ file, ...measure(file) }))
    .sort((a, b) => b.raw - a.raw)
    .slice(0, 12);

const kb = (n) => (n / 1024).toFixed(1);
if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ rows, chunks }, null, 2));
} else {
    console.log("route | JS raw/gz/br KB | CSS raw/gz/br KB");
    for (const r of rows) {
        console.log(
            `${r.route} | ${kb(r.js.raw)}/${kb(r.js.gzip)}/${kb(r.js.brotli)} | ${kb(r.css.raw)}/${kb(r.css.gzip)}/${kb(r.css.brotli)}`,
        );
    }
    console.log("\nlargest files | raw/gz/br KB");
    for (const c of chunks) console.log(`${c.file} | ${kb(c.raw)}/${kb(c.gzip)}/${kb(c.brotli)}`);
}

if (process.argv.includes("--check")) {
    const over = rows.filter((r) => {
        const limit = r.route.startsWith("shell")
            ? budgets.shellGzipKB
            : (budgets.routeGzipKB[r.route] ?? budgets.defaultRouteGzipKB);
        return (r.js.gzip + r.css.gzip) / 1024 > limit;
    });
    const fat = chunks.filter(
        (c) => c.gzip / 1024 > budgets.maxChunkGzipKB && !budgets.allowLargeChunks.some((p) => c.file.includes(p)),
    );
    const probes = dispatchProbes();
    const leaked = [...shell].filter((file) => {
        if (!file.endsWith(".js")) return false;
        const source = readFileSync(path.join(out, file), "utf8");
        return probes.some((probe) => source.includes(probe));
    });
    for (const r of over) console.error(`over budget: ${r.route} ${kb(r.js.gzip + r.css.gzip)} KB gzip`);
    for (const c of fat) console.error(`chunk over ${budgets.maxChunkGzipKB} KB gzip: ${c.file} ${kb(c.gzip)} KB`);
    for (const file of leaked) console.error(`shell carries dispatch.* text: ${file}`);
    if (over.length || fat.length || leaked.length) process.exit(1);
}

/**
 * Long plain sentences from the `dispatch` namespace. It loads with its route, so none of them may reach a shell
 * chunk.
 */
function dispatchProbes() {
    const en = JSON.parse(readFileSync(new URL("../../../locales/dispatch/en.json", import.meta.url), "utf8"));
    const leaves = [];
    const walk = (node) => (typeof node === "string" ? leaves.push(node) : Object.values(node).forEach(walk));
    walk(en.dispatch);
    return leaves.filter((s) => s.length > 30 && /^[A-Za-z ,.]+$/.test(s)).slice(0, 20);
}
