import type { ChangelogEntry, ChangelogGroup } from "./changelog";

export type SectionKind = "added" | "changed" | "fixed" | "removed" | "other";

export interface Headline {
    title: string;
    lead: string;
    points: string[];
}

export interface Brief {
    title: string;
    kind: SectionKind;
    items: string[];
    groups: ChangelogGroup[];
}

export interface ReleaseStory {
    version: string;
    date: string | null;
    /** The release's feature groups under Added, the ones the changelog gives a heading of their own. */
    headlines: Headline[];
    briefs: Brief[];
    counts: Record<SectionKind, number> & { total: number };
}

const KINDS: SectionKind[] = ["added", "changed", "fixed", "removed"];

export function sectionKind(title: string): SectionKind {
    const kind = title.trim().toLowerCase();
    return KINDS.find((k) => k === kind) ?? "other";
}

export function releaseStory(entry: ChangelogEntry): ReleaseStory {
    const headlines: Headline[] = [];
    const briefs: Brief[] = [];
    const counts = { added: 0, changed: 0, fixed: 0, removed: 0, other: 0, total: 0 };

    for (const section of entry.sections) {
        const kind = sectionKind(section.title);
        const groups = section.groups ?? [];
        const size = section.items.length + groups.reduce((n, g) => n + g.items.length, 0);
        counts[kind] += size;
        counts.total += size;

        if (kind === "added") {
            for (const group of groups) {
                const [lead = "", ...points] = group.items;
                headlines.push({ title: group.title, lead, points });
            }
        }
        const briefGroups = kind === "added" ? [] : groups;
        if (section.items.length === 0 && briefGroups.length === 0) continue;
        briefs.push({ title: section.title, kind, items: section.items, groups: briefGroups });
    }

    return { version: entry.version, date: entry.date, headlines, briefs, counts };
}

export type PatchHeading = { name: string } | { kind: SectionKind; title: string };

export interface PatchSection {
    id: string;
    heading: PatchHeading;
    lines: string[];
}

/** The release as patch notes: loose additions first, as the game's notes open with General, then each feature. */
export function patchSections(story: ReleaseStory): PatchSection[] {
    const out: Omit<PatchSection, "id">[] = [];
    const added = story.briefs.filter((b) => b.kind === "added");
    const rest = story.briefs.filter((b) => b.kind !== "added");
    for (const brief of added) out.push({ heading: { kind: brief.kind, title: brief.title }, lines: brief.items });
    for (const h of story.headlines) out.push({ heading: { name: h.title }, lines: [h.lead, ...h.points] });
    for (const brief of rest) {
        if (brief.items.length > 0) out.push({ heading: { kind: brief.kind, title: brief.title }, lines: brief.items });
        for (const g of brief.groups) out.push({ heading: { name: g.title }, lines: g.items });
    }
    return out.map((s, i) => ({ id: `patch-${i}`, ...s }));
}
