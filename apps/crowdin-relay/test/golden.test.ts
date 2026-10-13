import { describe, expect, it } from "vitest";
import { render } from "../src/render";
import fileTranslated from "./fixtures/file-translated.json";
import stringAdded from "./fixtures/string-added.json";
import suggestionAdded from "./fixtures/suggestion-added.json";
import suggestionApproved from "./fixtures/suggestion-approved.json";
import golden from "./golden/payloads.json";

function edit(fixture: unknown, change: (event: Record<string, any>) => void): unknown {
    const event = structuredClone(fixture) as Record<string, any>;
    change(event);
    return event;
}

const cases: Record<string, unknown> = {
    "file translated": fileTranslated,
    "string added": stringAdded,
    "suggestion added": suggestionAdded,
    "suggestion approved": suggestionApproved,
    "unknown event with a project": { event: "project.built", project: { name: "Deadlock+" } },
    "unknown event without a project": { event: "task.added" },
    "non-object payload": null,
    "file path over the limit": edit(fileTranslated, (e) => (e.file.path = "/" + "a".repeat(5000))),
    "file path with a backtick": edit(fileTranslated, (e) => (e.file.path = "/locales/a`b.json")),
    "translation of emoji over the limit": edit(suggestionAdded, (e) => (e.translation.text = "😀".repeat(1500))),
    "suggestion without a string url": edit(suggestionAdded, (e) => delete e.translation.string.url),
};

describe("exact payloads", () => {
    it("covers every recorded payload", () => {
        expect(Object.keys(cases).sort()).toEqual(Object.keys(golden).sort());
    });

    it.each(Object.keys(cases))("%s", (name) => {
        const expected = (golden as Record<string, unknown>)[name];
        expect(JSON.stringify(render(cases[name]))).toBe(JSON.stringify(expected));
    });
});
