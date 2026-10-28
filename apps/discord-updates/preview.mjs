// Prints how a CHANGELOG.md entry would be split into Discord messages, without sending anything.
// Usage: node preview.mjs [version]   (defaults to Unreleased)
import { readFileSync } from "node:fs";
import { changelogNotes } from "../../scripts/release.mjs";
import { render } from "./render.mjs";

const version = process.argv[2] ?? "Unreleased";
const notes = changelogNotes(readFileSync(new URL("../../CHANGELOG.md", import.meta.url), "utf8"), version);
if (!notes) {
    console.error(`CHANGELOG.md has no entry for ${version}`);
    process.exit(1);
}

function texts(components) {
    return components.flatMap((c) => [...(c.type === 10 ? [c.content] : []), ...texts(c.components ?? [])]);
}

function count(components) {
    return components.reduce((n, c) => n + 1 + count(c.components ?? []) + (c.accessory ? 1 : 0), 0);
}

const parts = render({ tag: `v${version}`, url: "https://example.invalid/release", notes });
console.log(`${version}: ${notes.length} characters of notes, ${parts.length} message(s)`);
for (const [i, part] of parts.entries()) {
    const all = texts(part.components);
    const lines = all
        .filter((t) => !t.startsWith("## ") && !t.startsWith("-# "))
        .join("\n")
        .split("\n");
    const chars = all.reduce((n, t) => n + t.length, 0);
    console.log(`\nPart ${i + 1}: ${chars}/4000 characters, ${count(part.components)}/40 components`);
    const extras = [i === 0 && "header", i === parts.length - 1 && "footer"].filter(Boolean).join(" + ");
    console.log(`  ${extras || "continuation"}`);
    console.log(`  first: ${lines[0]}`);
    console.log(`  last:  ${lines.at(-1)}`);
}
