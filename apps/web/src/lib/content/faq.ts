import type { Translator } from "$lib/i18n";
import { LINKS } from "./links";

export type FaqLink = { href: string; label: string };
export type FaqItem = { question: string; answer: string; links?: FaqLink[] };

const ITEMS: readonly { id: string; links?: { href: string; label: string }[] }[] = [
    { id: "free" },
    { id: "discord", links: [{ href: "/features#discord-presence", label: "features.items.discord_presence.name" }] },
    { id: "servers", links: [{ href: "/features#server-picker", label: "features.items.server_picker.name" }] },
    { id: "platforms", links: [{ href: LINKS.linux, label: "faq.links.linux_notes" }] },
    { id: "stats" },
    {
        id: "privacy",
        links: [
            { href: LINKS.appPrivacy, label: "faq.links.app_privacy" },
            { href: "/privacy", label: "nav.privacy" },
        ],
    },
    { id: "performance" },
    {
        id: "open_source",
        links: [
            { href: LINKS.repo, label: "home.read_code" },
            { href: "/transparency", label: "nav.transparency" },
        ],
    },
];

// The page and its FAQPage structured data both read this list, so they cannot disagree.
export function faq({ t }: Translator): FaqItem[] {
    return ITEMS.map(({ id, links }) => ({
        question: t(`faq.items.${id}.question`),
        answer: t(`faq.items.${id}.answer`),
        ...(links && { links: links.map((link) => ({ href: link.href, label: t(link.label) })) }),
    }));
}
