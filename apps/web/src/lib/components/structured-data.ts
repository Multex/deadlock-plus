import { FALLBACK_CODE, inviteUrl } from "@deadlock-plus/links";
import { REPO_URL, SITE_URL } from "@deadlock-plus/links/urls";

import { OG_IMAGE, SITE_NAME } from "./seo";

export type SchemaNode = Record<string, unknown> & { "@type": string };

const ORGANIZATION_ID = `${SITE_URL}/#organization`;

export function siteNodes(locale: string): SchemaNode[] {
    return [
        {
            "@type": "Organization",
            "@id": ORGANIZATION_ID,
            name: SITE_NAME,
            url: `${SITE_URL}/`,
            logo: `${SITE_URL}/icon-512.png`,
            sameAs: [REPO_URL, inviteUrl(FALLBACK_CODE)],
        },
        {
            "@type": "WebSite",
            "@id": `${SITE_URL}/#website`,
            name: SITE_NAME,
            url: `${SITE_URL}/`,
            inLanguage: locale,
            publisher: { "@id": ORGANIZATION_ID },
        },
    ];
}

// No aggregateRating or review: there are none to cite, and invented ones break Google's rules.
// No softwareVersion: the page would go stale on every release.
export function softwareApplication(description: string): SchemaNode {
    return {
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        description,
        url: `${SITE_URL}/`,
        operatingSystem: "Windows, Linux",
        applicationCategory: "GameApplication",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        downloadUrl: `${SITE_URL}/download`,
        image: `${SITE_URL}${OG_IMAGE.path}`,
        publisher: { "@id": ORGANIZATION_ID },
    };
}

export function faqPage(items: readonly { question: string; answer: string }[]): SchemaNode {
    return {
        "@type": "FAQPage",
        mainEntity: items.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
    };
}

/** Escapes `<` so no string in the data can close the script tag it is written into. */
export function jsonLd(nodes: SchemaNode[]): string {
    return JSON.stringify({ "@context": "https://schema.org", "@graph": nodes }).replaceAll("<", "\\u003c");
}
