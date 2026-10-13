import assert from "node:assert/strict";
import { test } from "node:test";
import {
    BLURPLE,
    COMPONENTS_V2,
    MAX_COMPONENTS,
    MAX_MESSAGE_TEXT,
    clip,
    container,
    inlineCode,
    linkButton,
    message,
    section,
    separator,
    text,
} from "../src/index.ts";

test("constants match Discord's values", () => {
    assert.equal(COMPONENTS_V2, 32768);
    assert.equal(BLURPLE, 0x5865f2);
    assert.equal(MAX_MESSAGE_TEXT, 4000);
    assert.equal(MAX_COMPONENTS, 40);
});

test("text display", () => {
    assert.equal(JSON.stringify(text("hi")), '{"type":10,"content":"hi"}');
});

test("separator is a visible divider with small spacing", () => {
    assert.equal(JSON.stringify(separator()), '{"type":14,"divider":true,"spacing":1}');
});

test("link button", () => {
    assert.equal(
        JSON.stringify(linkButton("Open", "https://example.com")),
        '{"type":2,"style":5,"label":"Open","url":"https://example.com"}',
    );
});

test("section holds one text display and its accessory", () => {
    assert.equal(
        JSON.stringify(section(text("a"), linkButton("Open", "https://example.com"))),
        '{"type":9,"components":[{"type":10,"content":"a"}],"accessory":{"type":2,"style":5,"label":"Open","url":"https://example.com"}}',
    );
});

test("container defaults to the blurple accent", () => {
    assert.equal(
        JSON.stringify(container([text("a")])),
        '{"type":17,"accent_color":5793266,"components":[{"type":10,"content":"a"}]}',
    );
    assert.equal(container([], 0xff0000).accent_color, 0xff0000);
});

test("message sets the V2 flag and pings nobody", () => {
    assert.equal(
        JSON.stringify(message("Bot", [container([text("a")])])),
        '{"username":"Bot","flags":32768,"allowed_mentions":{"parse":[]},"components":[{"type":17,"accent_color":5793266,"components":[{"type":10,"content":"a"}]}]}',
    );
});

test("message gives every call its own allowed_mentions", () => {
    const a = message("Bot", []);
    const b = message("Bot", []);
    assert.notEqual(a.allowed_mentions, b.allowed_mentions);
    assert.notEqual(a.allowed_mentions.parse, b.allowed_mentions.parse);
});

test("clip leaves text at or under the limit alone", () => {
    assert.equal(clip("abc", 3), "abc");
    assert.equal(clip("", 3), "");
});

test("clip cuts to the limit and ends with an ellipsis", () => {
    assert.equal(clip("abcdef", 4), "abc…");
    assert.equal(clip("x".repeat(50), 10).length, 10);
});

test("clip never leaves half a surrogate pair", () => {
    const clipped = clip("😀".repeat(10), 6);
    assert.equal(clipped, "😀😀…");
    assert.doesNotThrow(() => encodeURIComponent(clipped));
});

test("inline code swaps backticks and keeps both fences inside the limit", () => {
    assert.equal(inlineCode("a`b", 100), "`a'b`");
    const long = inlineCode("a".repeat(50), 10);
    assert.equal(long.length, 10);
    assert.equal(long, "`aaaaaaa…`");
});
