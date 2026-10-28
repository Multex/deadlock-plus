import {
    type ContainerChild,
    type Message,
    clip,
    container,
    linkButton,
    message,
    section,
    separator,
    text,
} from "./index.ts";

const MAX_LINE = 1000;
const SHOWN_NAMES = 3;

export interface Tally {
    action: string;
    count: number;
    names: string[];
}

export interface CrowdinSummary {
    title: string;
    /** Prefixes the line, e.g. the language code. */
    subject?: string;
    tallies: Tally[];
    project?: string;
    link?: { label: string; url: string };
}

/** "A, B, C and 2 others". */
export function people(names: string[]): string {
    const shown = names.slice(0, SHOWN_NAMES).join(", ");
    const rest = names.length - SHOWN_NAMES;
    if (rest <= 0) return shown;
    return `${shown} and ${rest} ${rest === 1 ? "other" : "others"}`;
}

/** "ru: 412 strings translated by A, B; 120 approved". Only the first tally names the strings. */
export function tallyLine(subject: string | undefined, tallies: Tally[]): string {
    const parts = tallies
        .filter((tally) => tally.count > 0)
        .map((tally, index) => {
            const noun = index === 0 ? (tally.count === 1 ? " string" : " strings") : "";
            const by = tally.names.length > 0 ? ` by ${people(tally.names)}` : "";
            return `${tally.count}${noun} ${tally.action}${by}`;
        });
    const line = parts.join("; ");
    return subject === undefined ? line : `${subject}: ${line}`;
}

export function crowdinSummary(summary: CrowdinSummary): Message {
    const header = text(`### ${clip(summary.title, 200)}`);
    const components: ContainerChild[] = [
        summary.link ? section(header, linkButton(summary.link.label, summary.link.url)) : header,
        text(clip(tallyLine(summary.subject, summary.tallies), MAX_LINE)),
    ];
    if (summary.project !== undefined) {
        components.push(separator(), text(`**Project**\n${clip(summary.project, MAX_LINE)}`));
    }
    return message("Crowdin", [container(components)]);
}
