import { createRawSnippet } from "svelte";
import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("$app/state", () => ({ page: { url: new URL("https://deadlockplus.app/"), status: 200 } }));

import Layout from "./+layout.svelte";

describe("the site layout", () => {
    it("adds no headings to the page outline from its footer", () => {
        const children = createRawSnippet(() => ({ render: () => "<p>page</p>" }));
        const { body } = render(Layout, { props: { children } });
        const footer = body.slice(body.indexOf("<footer"));

        expect(footer).toContain("Community");
        expect(footer).not.toMatch(/<h[1-6][\s>]/);
    });
});
