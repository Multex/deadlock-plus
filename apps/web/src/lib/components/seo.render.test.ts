import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ page: { url: new URL("https://deadlockplus.app/somewhere"), status: 404 } }));
vi.mock("$app/state", () => state);

import ErrorPage from "../../routes/+error.svelte";
import Seo from "./seo.svelte";

const NOINDEX = /<meta name="robots" content="noindex"/;

describe("<Seo>", () => {
    it("lets search engines index a page by default", () => {
        const { head } = render(Seo, { props: { title: "Features | Deadlock+" } });
        expect(head).toContain("<title>Features | Deadlock+</title>");
        expect(head).not.toMatch(/name="robots"/);
    });

    it("keeps a page out of search results when asked", () => {
        const { head } = render(Seo, { props: { title: "x", noindex: true } });
        expect(head).toMatch(NOINDEX);
    });
});

describe("the error page", () => {
    it.each([404, 500])("is kept out of search results on a %i", (status) => {
        state.page.status = status;
        expect(render(ErrorPage).head).toMatch(NOINDEX);
    });
});
