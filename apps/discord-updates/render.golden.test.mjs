import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { render } from "./render.mjs";

const golden = JSON.parse(readFileSync(new URL("./render.golden.json", import.meta.url), "utf8"));

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

const release = {
    tag: "v0.8.0",
    url: "https://github.com/deadlock-plus/deadlock-plus/releases/tag/v0.8.0",
    notes: NOTES,
};

const bullets = Array.from({ length: 200 }, (_, i) => `- Bullet number ${i} with some padding text to take room.`);

const cases = {
    "a release with three sections": release,
    "notes over the text budget": {
        ...release,
        notes: `### Added\n\n${bullets.join("\n")}\n\n### Fixed\n\n- One fix.`,
    },
    "one overlong bullet": { ...release, notes: `### Fixed\n\n- ${"x".repeat(2000)}` },
    "an overlong bullet of emoji": { ...release, notes: `### Fixed\n\n- ${"😀".repeat(400)}` },
    "empty notes": { ...release, notes: "" },
    "a prerelease tag": { ...release, tag: "v0.9.0-beta.1" },
    "notes with CRLF and text before the first section": {
        ...release,
        notes: "Intro line.\r\n\r\n### Changed\r\n\r\n- One change.\r\n",
    },
};

test("covers every recorded payload", () => {
    assert.deepEqual(Object.keys(cases).sort(), Object.keys(golden).sort());
});

for (const [name, input] of Object.entries(cases)) {
    test(`exact payload: ${name}`, () => {
        assert.equal(JSON.stringify(render(input)), JSON.stringify(golden[name]));
    });
}
