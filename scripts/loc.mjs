import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LANGUAGES = {
    ".rs": "Rust",
    ".ts": "TypeScript",
    ".svelte": "Svelte",
    ".js": "JavaScript",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".css": "CSS",
};
const SKIPPED = [/^locales\//, /^packages\/ipc-types\//];
const START = "<!-- loc:start -->";
const END = "<!-- loc:end -->";

export function countLines(source) {
    return source.split("\n").filter((line) => line.trim() !== "").length;
}

export function languageOf(file) {
    if (SKIPPED.some((pattern) => pattern.test(file))) return null;
    return LANGUAGES[path.posix.extname(file)] ?? null;
}

export function tally(files) {
    const byLanguage = new Map();
    for (const { path: file, source } of files) {
        const language = languageOf(file);
        if (!language) continue;
        const row = byLanguage.get(language) ?? { language, files: 0, lines: 0 };
        row.files += 1;
        row.lines += countLines(source);
        byLanguage.set(language, row);
    }
    const rows = [...byLanguage.values()].sort((a, b) => b.lines - a.lines);
    const total = rows.reduce((sum, row) => ({ files: sum.files + row.files, lines: sum.lines + row.lines }), {
        files: 0,
        lines: 0,
    });
    return { rows, total };
}

export function renderTable({ rows, total }) {
    const n = (value) => value.toLocaleString("en-US");
    return [
        "| Language | Files | Lines |",
        "| --- | ---: | ---: |",
        ...rows.map((row) => `| ${row.language} | ${n(row.files)} | ${n(row.lines)} |`),
        `| **Total** | **${n(total.files)}** | **${n(total.lines)}** |`,
    ].join("\n");
}

export function replaceBlock(readme, block) {
    const start = readme.indexOf(START);
    const end = readme.indexOf(END);
    if (start === -1 || end < start) throw new Error(`README needs ${START} and ${END} markers`);
    return `${readme.slice(0, start + START.length)}\n${block}\n${readme.slice(end)}`;
}

function main() {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0");
    const files = tracked
        .filter((file) => languageOf(file))
        .map((file) => ({ path: file, source: readFileSync(path.join(root, file), "utf8") }));
    const readmePath = path.join(root, "README.md");
    const readme = readFileSync(readmePath, "utf8");
    const updated = replaceBlock(readme, renderTable(tally(files)));
    if (updated !== readme) writeFileSync(readmePath, updated);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
