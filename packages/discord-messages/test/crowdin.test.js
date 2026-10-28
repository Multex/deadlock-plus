import assert from "node:assert/strict";
import { test } from "node:test";
import { crowdinSummary, people, tallyLine } from "../src/crowdin.ts";

test("people lists up to three names", () => {
    assert.equal(people([]), "");
    assert.equal(people(["A"]), "A");
    assert.equal(people(["A", "B"]), "A, B");
    assert.equal(people(["A", "B", "C"]), "A, B, C");
});

test("people folds the rest into a count", () => {
    assert.equal(people(["A", "B", "C", "D"]), "A, B, C and 1 other");
    assert.equal(people(["A", "B", "C", "D", "E"]), "A, B, C and 2 others");
});

test("tally line names the language, the strings and who did what", () => {
    assert.equal(
        tallyLine("ru", [
            { action: "translated", count: 412, names: ["A", "B"] },
            { action: "approved", count: 120, names: [] },
        ]),
        "ru: 412 strings translated by A, B; 120 approved",
    );
});

test("tally line uses the singular for one string", () => {
    assert.equal(tallyLine("ru", [{ action: "translated", count: 1, names: ["A"] }]), "ru: 1 string translated by A");
});

test("tally line skips empty tallies and works without a subject", () => {
    assert.equal(
        tallyLine(undefined, [
            { action: "added", count: 0, names: ["A"] },
            { action: "updated", count: 3, names: ["B"] },
            { action: "deleted", count: 1, names: [] },
        ]),
        "3 strings updated by B; 1 deleted",
    );
});

test("summary message has a header, the tally line and the project", () => {
    const message = crowdinSummary({
        title: "Russian translations",
        subject: "ru",
        tallies: [{ action: "translated", count: 2, names: ["A"] }],
        project: "Deadlock+",
        link: { label: "Open in editor", url: "https://crowdin.com/editor/deadlock-plus/all/en-ru" },
    });
    assert.equal(
        JSON.stringify(message),
        JSON.stringify({
            username: "Crowdin",
            flags: 32768,
            allowed_mentions: { parse: [] },
            components: [
                {
                    type: 17,
                    accent_color: 0x5865f2,
                    components: [
                        {
                            type: 9,
                            components: [{ type: 10, content: "### Russian translations" }],
                            accessory: {
                                type: 2,
                                style: 5,
                                label: "Open in editor",
                                url: "https://crowdin.com/editor/deadlock-plus/all/en-ru",
                            },
                        },
                        { type: 10, content: "ru: 2 strings translated by A" },
                        { type: 14, divider: true, spacing: 1 },
                        { type: 10, content: "**Project**\nDeadlock+" },
                    ],
                },
            ],
        }),
    );
});

test("summary message without a link or project is just the header and the line", () => {
    const message = crowdinSummary({
        title: "Source strings",
        tallies: [{ action: "added", count: 5, names: [] }],
    });
    assert.deepEqual(message.components[0].components, [
        { type: 10, content: "### Source strings" },
        { type: 10, content: "5 strings added" },
    ]);
});

test("summary message clips a very long line", () => {
    const names = Array.from({ length: 3 }, (_, i) => `${i}`.repeat(2000));
    const message = crowdinSummary({ title: "T", tallies: [{ action: "translated", count: 9, names }] });
    assert.ok(message.components[0].components[1].content.length <= 1000);
});
