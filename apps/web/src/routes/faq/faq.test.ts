import { createRawSnippet } from "svelte";
import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("$app/state", () => ({ page: { url: new URL("https://deadlockplus.app/faq"), status: 200, state: {} } }));

import { faq } from "$lib/content/faq";
import { english } from "$lib/i18n";
import Home from "../+page.svelte";
import Layout from "../+layout.svelte";
import Faq from "./+page.svelte";

const FAQ = faq(english);
const { head, body } = render(Faq);

const decode = (html: string) =>
    html
        .replace(/<!--.*?-->/g, "")
        .replace(/<[^>]+>/g, "")
        .replaceAll("&amp;", "&")
        .replaceAll("&#39;", "'")
        .replaceAll("&quot;", '"')
        .replace(/\s+/g, " ")
        .trim();

describe("the FAQ page", () => {
    it("answers the questions people search for", () => {
        expect(FAQ.map((item) => item.question)).toEqual([
            "Is Deadlock+ free? Do I need an account?",
            "How do I show my Deadlock match and rank on Discord?",
            "How do I pick which servers I play on?",
            "Does it work on Linux? On Mac?",
            "Where do my stats and match history come from?",
            "What does Deadlock+ record about me?",
            "Does it slow down the game?",
            "Is Deadlock+ open source?",
        ]);
    });

    it("shows every question as a heading with its whole answer open below it", () => {
        const headings = [...body.matchAll(/<h2[^>]*>(.*?)<\/h2>/gs)].map((m) => decode(m[1] ?? ""));
        expect(headings).toEqual(FAQ.map((item) => item.question));
        const text = decode(body);
        for (const item of FAQ) expect(text).toContain(item.answer);
    });

    it("links each source an answer points to", () => {
        for (const link of FAQ.flatMap((item) => item.links ?? [])) {
            expect(body).toContain(`href="${link.href}"`);
        }
    });

    it("gives search engines the same questions and answers the page shows", () => {
        const data = JSON.parse(head.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1] ?? "{}");
        const faqPage = data["@graph"].find((node: { "@type": string }) => node["@type"] === "FAQPage");
        expect(faqPage.mainEntity).toEqual(
            FAQ.map((item) => ({
                "@type": "Question",
                name: item.question,
                acceptedAnswer: { "@type": "Answer", text: item.answer },
            })),
        );
    });

    it("makes no claim about bans", () => {
        expect(decode(body)).not.toMatch(/\bban(s|ned)?\b/i);
    });
});

describe("links to the FAQ", () => {
    it("sit in the footer", () => {
        const children = createRawSnippet(() => ({ render: () => "<p>page</p>" }));
        const html = render(Layout, { props: { children } }).body;
        expect(html.slice(html.indexOf("<footer"))).toMatch(/href="\/faq"/);
    });

    it("sit next to the home page's safety notes", () => {
        const html = render(Home).body;
        const safety = html.slice(html.indexOf("Is it safe?"));
        expect(safety).toMatch(/href="\/faq"/);
    });
});
