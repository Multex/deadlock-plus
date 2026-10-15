import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("$app/state", () => ({ page: { url: new URL("https://deadlockplus.app/"), status: 200, state: {} } }));

import HomePage from "../../routes/+page.svelte";
import FeaturesPage from "../../routes/features/+page.svelte";
import Seo from "./seo.svelte";
import { jsonLd } from "./structured-data";

type Node = Record<string, unknown> & { "@type": string };

function graph(head: string): Node[] {
    const scripts = [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    const data = JSON.parse(scripts[0]?.[1] ?? "");
    expect(data["@context"]).toBe("https://schema.org");
    return data["@graph"];
}

const ofType = (nodes: Node[], type: string) => nodes.find((node) => node["@type"] === type);

describe("jsonLd", () => {
    it("cannot close the script tag it is written into", () => {
        const text = jsonLd([{ "@type": "Thing", name: "</script><script>alert(1)</script>" }]);
        expect(text).not.toContain("</script>");
        expect(JSON.parse(text)["@graph"][0].name).toBe("</script><script>alert(1)</script>");
    });
});

describe("every page", () => {
    it("names the site and who publishes it", () => {
        const nodes = graph(render(Seo, { props: { title: "x" } }).head);

        const organization = ofType(nodes, "Organization");
        expect(organization).toMatchObject({ name: "Deadlock+", url: "https://deadlockplus.app/" });
        expect(organization?.sameAs).toEqual(
            expect.arrayContaining([
                "https://github.com/deadlock-plus/deadlock-plus",
                expect.stringMatching(/^https:\/\/discord\.gg\//),
            ]),
        );
        expect(ofType(nodes, "WebSite")).toMatchObject({
            name: "Deadlock+",
            url: "https://deadlockplus.app/",
            publisher: { "@id": organization?.["@id"] },
        });
    });

    it("describes the app only on the home page", () => {
        expect(ofType(graph(render(FeaturesPage).head), "SoftwareApplication")).toBeUndefined();
    });
});

describe("the home page", () => {
    const app = () => ofType(graph(render(HomePage).head), "SoftwareApplication");

    it("describes Deadlock+ as a free game app for Windows and Linux", () => {
        expect(app()).toMatchObject({
            name: "Deadlock+",
            operatingSystem: "Windows, Linux",
            applicationCategory: "GameApplication",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            downloadUrl: "https://deadlockplus.app/download",
            image: "https://deadlockplus.app/og.png",
        });
    });

    it("claims no ratings and no version that could go stale", () => {
        expect(app()).not.toHaveProperty("aggregateRating");
        expect(app()).not.toHaveProperty("review");
        expect(app()).not.toHaveProperty("softwareVersion");
    });
});
