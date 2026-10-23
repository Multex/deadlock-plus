import { describe, expect, it } from "vitest";
import { authorBuildsHref, buildsTab } from "./builds-page";
import { filtersFromParams, heroParam } from "./public-builds";

const paramsOf = (href: string) => new URL(href, "http://app.local").searchParams;

describe("authorBuildsHref", () => {
    it("opens the public browser filtered to the author on the build's hero", () => {
        const href = authorBuildsHref(29715818, 13);
        expect(new URL(href, "http://app.local").pathname).toBe("/builds");
        expect(buildsTab(paramsOf(href))).toBe("public");
        expect(filtersFromParams(paramsOf(href)).author).toBe(29715818);
        expect(heroParam(paramsOf(href))).toBe(13);
    });
});

describe("buildsTab", () => {
    it("is the public tab unless the URL asks for the player's own builds", () => {
        expect(buildsTab(paramsOf("/builds"))).toBe("public");
        expect(buildsTab(paramsOf("/builds?author=29715818"))).toBe("public");
        expect(buildsTab(paramsOf("/builds?tab=other"))).toBe("public");
        expect(buildsTab(paramsOf("/builds?tab=mine"))).toBe("mine");
    });
});
