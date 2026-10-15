import { LINKS } from "./links";

export type FaqItem = { question: string; answer: string; links?: { href: string; label: string }[] };

// The page and its FAQPage structured data both read this list, so they cannot disagree.
export const FAQ: readonly FaqItem[] = [
    {
        question: "Is Deadlock+ free? Do I need an account?",
        answer: "Yes, it is free. There is no account to make and nothing to sign up for.",
    },
    {
        question: "How do I show my Deadlock match and rank on Discord?",
        answer: "Turn on Discord Rich Presence in the app's Presence page. Your Discord profile then shows your hero, mode and match timer, and your rank badge in ranked matches. You can change the text, images and timer Discord shows.",
        links: [{ href: "/features#discord-presence", label: "Discord Rich Presence" }],
    },
    {
        question: "How do I pick which servers I play on?",
        answer: "Open the Server Picker and block the regions you do not want. It shows your ping to every region first. On Windows it uses firewall rules, which is why the app asks for administrator rights. You can unblock a region at any time, and bring over your blocked regions from ServerPickerX or CS2ServerPicker.",
        links: [{ href: "/features#server-picker", label: "Server Picker" }],
    },
    {
        question: "Does it work on Linux? On Mac?",
        answer: "Linux: yes, as a .deb or an AppImage. Support is best-effort, and some features need extra setup. Mac: no, macOS is not supported.",
        links: [{ href: LINKS.linux, label: "Linux notes" }],
    },
    {
        question: "Where do my stats and match history come from?",
        answer: "From the Deadlock API, a free community database. To fetch your matches and rank, the app sends it your Steam account ID and nothing else about you.",
    },
    {
        question: "What does Deadlock+ record about me?",
        answer: "The app runs on your PC. The few things it sends are listed one by one on GitHub, and anonymous usage data and error reports can be turned off in Settings. This website uses no cookies.",
        links: [
            { href: LINKS.appPrivacy, label: "The app's privacy list" },
            { href: "/privacy", label: "Privacy" },
        ],
    },
    {
        question: "Does it slow down the game?",
        answer: "We cannot guarantee it, but we try our best to keep Deadlock+'s resource use as low as possible.",
    },
    {
        question: "Is Deadlock+ open source?",
        answer: "Yes. The code is public on GitHub under GPL-3.0-or-later, so anyone can check what it does. What it costs to run and how many people use it are on the Transparency page.",
        links: [
            { href: LINKS.repo, label: "Read the code" },
            { href: "/transparency", label: "Transparency" },
        ],
    },
];
