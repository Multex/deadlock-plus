import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { render } from "./render.mjs";

const NOTES = `### Added

#### Discord activity

- Deadlock+ can show on your Discord profile.
- Turn it on in Settings > Discord.

#### Editor

- Change every line of your activity.

### Changed

- Community translations are updated.

### Fixed

- Text in Cyrillic uses a matching font.`;

const LONG_NOTES = readFileSync(new URL("./fixtures/changelog-0.15.0.md", import.meta.url), "utf8");

const release = {
    tag: "v0.8.0",
    url: "https://github.com/deadlock-plus/deadlock-plus/releases/tag/v0.8.0",
    notes: NOTES,
};

const FOOTER = "-# Deadlock+ checks for updates on its own. You can also download it from the release page.";

function texts(message) {
    const out = [];
    const walk = (components) => {
        for (const c of components) {
            if (c.type === 10) out.push(c.content);
            if (c.components) walk(c.components);
        }
    };
    walk(message.components);
    return out;
}

function total(message) {
    return texts(message).reduce((n, t) => n + t.length, 0);
}

function count(components) {
    return components.reduce((n, c) => n + 1 + (c.components ? count(c.components) : 0) + (c.accessory ? 1 : 0), 0);
}

/** The changelog lines of one message, in order, without the header and footer. */
function bodyLines(message) {
    return texts(message)
        .filter((t) => !t.startsWith("## Deadlock+") && t !== FOOTER)
        .flatMap((t) => t.split("\n"));
}

function isHeading(line) {
    return line.startsWith("### ") || /^\*\*.*\*\*$/.test(line);
}

/** What the notes read as in Discord: `####` groups become bold lines, text before the first section is dropped. */
function expectedLines(notes) {
    const out = [];
    let inSection = false;
    for (const raw of notes.split(/\r?\n/)) {
        const line = raw.trim();
        if (line === "") continue;
        if (line.startsWith("### ")) inSection = true;
        if (!inSection) continue;
        out.push(line.startsWith("#### ") ? `**${line.slice(5)}**` : line);
    }
    return out;
}

/** Joins the parts back into one list, dropping the headings a part repeats to give its bullets context. */
function joined(parts) {
    const out = [];
    let section;
    let group;
    parts.forEach((part, i) => {
        let lines = bodyLines(part);
        if (i > 0) {
            if (lines[0] === section) lines = lines.slice(1);
            if (group && lines[0] === group) lines = lines.slice(1);
        }
        for (const line of lines) {
            if (line.startsWith("### ")) {
                section = line;
                group = undefined;
            } else if (isHeading(line)) {
                group = line;
            }
            out.push(line);
        }
    });
    return out;
}

function assertWithinLimits(parts) {
    for (const [i, part] of parts.entries()) {
        assert.ok(total(part) <= 4000, `part ${i + 1} has ${total(part)} characters`);
        assert.ok(count(part.components) <= 40, `part ${i + 1} has ${count(part.components)} components`);
    }
}

function assertCleanEnds(parts) {
    for (const [i, part] of parts.entries()) {
        const last = bodyLines(part).at(-1);
        assert.ok(!isHeading(last), `part ${i + 1} ends on the heading ${last}`);
    }
}

function bullets(n, label, width = 60) {
    return Array.from({ length: n }, (_, i) => `- ${label} ${i} `.padEnd(width, "x"));
}

test("sends a Components V2 container that pings nobody", () => {
    const [message] = render(release);
    assert.equal(message.flags, 1 << 15);
    assert.deepEqual(message.allowed_mentions, { parse: [] });
    assert.equal(message.components.length, 1);
    assert.equal(message.components[0].type, 17);
});

test("a short changelog is one message with the header, every line and the footer", () => {
    const parts = render(release);
    assert.equal(parts.length, 1);
    assert.deepEqual(bodyLines(parts[0]), expectedLines(NOTES));
    assert.equal(texts(parts[0]).at(-1), FOOTER);
});

test("header names the version without the tag prefix and links to the release", () => {
    const [[container]] = render(release).map((m) => m.components);
    const header = container.components[0];
    assert.equal(header.type, 9);
    assert.match(header.components[0].content, /Deadlock\+ 0\.8\.0/);
    assert.equal(header.accessory.url, release.url);
});

test("each changelog section becomes one text block with its bullets", () => {
    const all = texts(render(release)[0]);
    const added = all.find((t) => t.startsWith("### Added"));
    assert.ok(added);
    assert.match(added, /\*\*Discord activity\*\*/);
    assert.match(added, /- Turn it on in Settings > Discord\./);
    assert.ok(all.some((t) => t.startsWith("### Changed") && t.includes("- Community translations")));
    assert.ok(all.some((t) => t.startsWith("### Fixed") && t.includes("Cyrillic")));
});

test("the 0.15.0 changelog splits into several messages, each under Discord's limits", () => {
    const parts = render({ ...release, notes: LONG_NOTES });
    assert.ok(parts.length > 1, `got ${parts.length} part`);
    assertWithinLimits(parts);
});

test("a split changelog loses no line and only repeats headings", () => {
    const parts = render({ ...release, notes: LONG_NOTES });
    assert.deepEqual(joined(parts), expectedLines(LONG_NOTES));
    assert.doesNotMatch(parts.flatMap(texts).join("\n"), /…and \d+ more/);
});

test("no part of a split changelog ends on a heading", () => {
    assertCleanEnds(render({ ...release, notes: LONG_NOTES }));
});

test("only the first part has the header and only the last has the footer", () => {
    const parts = render({ ...release, notes: LONG_NOTES });
    const headers = parts.map((p) => p.components[0].components.some((c) => c.type === 9));
    assert.deepEqual(
        headers,
        parts.map((_, i) => i === 0),
    );
    const footers = parts.map((p) => texts(p).includes(FOOTER));
    assert.deepEqual(
        footers,
        parts.map((_, i) => i === parts.length - 1),
    );
});

test("no part pings anybody", () => {
    for (const part of render({ ...release, notes: LONG_NOTES })) {
        assert.deepEqual(part.allowed_mentions, { parse: [] });
        assert.equal(part.username, "Deadlock+");
    }
});

test("a continued section repeats its title, and a continued group its heading", () => {
    const parts = render({ ...release, notes: LONG_NOTES });
    let section;
    let group;
    for (const [i, part] of parts.entries()) {
        const lines = bodyLines(part);
        if (i > 0) {
            assert.ok(lines[0].startsWith("### "), `part ${i + 1} starts with ${lines[0]}`);
            if (lines[0] === section && group) {
                assert.ok(isHeading(lines[1]), `part ${i + 1} continues ${group} without its heading`);
            }
        }
        for (const line of lines) {
            if (line.startsWith("### ")) [section, group] = [line, undefined];
            else if (isHeading(line)) group = line;
        }
    }
});

test("sections that fit two to a message split between sections", () => {
    const notes = ["A", "B", "C"].map((s) => `### ${s}\n\n${bullets(28, s).join("\n")}`).join("\n\n");
    const parts = render({ ...release, notes });
    assert.equal(parts.length, 2);
    assert.deepEqual(
        parts.map((p) => bodyLines(p).filter((l) => l.startsWith("### "))),
        [["### A", "### B"], ["### C"]],
    );
    assert.deepEqual(joined(parts), expectedLines(notes));
});

test("a section too big for one message splits between its groups", () => {
    const groups = ["One", "Two", "Three"].map((g) => `#### ${g}\n\n${bullets(28, g).join("\n")}`);
    const notes = `### Added\n\n${groups.join("\n\n")}`;
    const parts = render({ ...release, notes });
    assert.equal(parts.length, 2);
    assert.deepEqual(bodyLines(parts[1]).slice(0, 2), ["### Added", "**Three**"]);
    assert.ok(!bodyLines(parts[0]).includes("**Three**"));
    assert.deepEqual(joined(parts), expectedLines(notes));
});

test("one huge group splits between bullets and repeats its heading", () => {
    const notes = `### Added\n\n#### Big group\n\n${bullets(150, "Bullet").join("\n")}\n\n### Fixed\n\n- One fix.`;
    const parts = render({ ...release, notes });
    assert.ok(parts.length >= 3, `got ${parts.length} parts`);
    assertWithinLimits(parts);
    assertCleanEnds(parts);
    for (const part of parts.slice(1)) {
        assert.deepEqual(bodyLines(part).slice(0, 2), ["### Added", "**Big group**"]);
    }
    assert.deepEqual(joined(parts), expectedLines(notes));
});

test("a group heading is never left at the end of a message", () => {
    const filler = bullets(64, "Filler");
    const notes = `### Added\n\n${filler.join("\n")}\n\n#### Late group\n\n${bullets(5, "Late").join("\n")}`;
    const parts = render({ ...release, notes });
    assert.ok(parts.length > 1);
    assertCleanEnds(parts);
    assert.deepEqual(joined(parts), expectedLines(notes));
});

test("a long group heading moves to the next message rather than end this one", () => {
    // Fits after the bullets above it, but not together with one bullet of its own.
    const heading = "Long heading ".padEnd(2200, "x");
    const notes = `### Added\n\n${bullets(28, "Before").join("\n")}\n\n#### ${heading}\n\n${bullets(40, "After").join("\n")}`;
    const parts = render({ ...release, notes });
    assertCleanEnds(parts);
    assert.equal(bodyLines(parts[1])[1], `**${heading}**`);
    assert.deepEqual(joined(parts), expectedLines(notes));
});

test("a bullet that wraps onto a second line is never split from it", () => {
    const wrapped = Array.from(
        { length: 50 },
        (_, i) => `- Wrapped bullet ${i} first line`.padEnd(60, "x") + "\n  " + "y".repeat(40),
    );
    const parts = render({ ...release, notes: `### Added\n\n${wrapped.join("\n")}` });
    assert.ok(parts.length > 1);
    for (const part of parts.slice(1)) {
        assert.ok(bodyLines(part)[1].startsWith("- "), `part starts mid-bullet: ${bodyLines(part)[1]}`);
    }
});

test("one overlong bullet is clipped", () => {
    const parts = render({ ...release, notes: `### Fixed\n\n- ${"x".repeat(2000)}` });
    assert.equal(parts.length, 1);
    assert.ok(total(parts[0]) < 1000);
});

test("empty notes still produce a header and the link", () => {
    const [[container]] = render({ ...release, notes: "" }).map((m) => m.components);
    assert.equal(container.components[0].accessory.url, release.url);
});

test("a prerelease tag keeps its suffix", () => {
    const [[container]] = render({ ...release, tag: "v0.9.0-beta.1" }).map((m) => m.components);
    assert.match(container.components[0].components[0].content, /0\.9\.0-beta\.1/);
});
