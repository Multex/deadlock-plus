export interface ChangelogGroup {
    title: string;
    items: string[];
}

export interface ChangelogSection {
    title: string;
    items: string[];
    groups?: ChangelogGroup[];
}

export interface ChangelogEntry {
    version: string;
    date: string | null;
    sections: ChangelogSection[];
}

const RELEASE_HEADING = /^##\s+\[?v?([^\]\s]+)\]?(?:\s+-\s+(\S+))?\s*$/;

export interface ParseOptions {
    /** Reads Unreleased as this release instead of skipping it, to preview notes ahead of a release. */
    unreleasedAs?: { version: string; date: string | null };
}

/** Reads Keep a Changelog markdown. Unreleased is skipped unless `unreleasedAs` names it: it is not shipped. */
export function parseChangelog(markdown: string, options: ParseOptions = {}): ChangelogEntry[] {
    const entries: ChangelogEntry[] = [];
    let entry: ChangelogEntry | null = null;
    let section: ChangelogSection | null = null;
    let group: ChangelogGroup | null = null;

    for (const raw of markdown.split(/\r?\n/)) {
        const line = raw.trimEnd();
        const release = RELEASE_HEADING.exec(line);
        if (release) {
            section = null;
            group = null;
            if (release[1].toLowerCase() === "unreleased") {
                const as = options.unreleasedAs;
                entry = as ? { version: as.version, date: as.date, sections: [] } : null;
                if (entry) entries.push(entry);
                continue;
            }
            entry = { version: release[1], date: release[2] ?? null, sections: [] };
            entries.push(entry);
            continue;
        }
        if (!entry) continue;

        const heading = /^###\s+(.+)$/.exec(line);
        if (heading) {
            section = { title: heading[1].trim(), items: [] };
            group = null;
            entry.sections.push(section);
            continue;
        }

        const groupHeading = /^####\s+(.+)$/.exec(line);
        if (groupHeading) {
            if (section) {
                group = { title: groupHeading[1].trim(), items: [] };
                (section.groups ??= []).push(group);
            }
            continue;
        }

        const bullet = /^[-*]\s+(.+)$/.exec(line);
        if (bullet) {
            if (!section) {
                section = { title: "", items: [] };
                entry.sections.push(section);
            }
            (group ?? section).items.push(bullet[1].trim());
        }
    }
    return entries;
}

function parts(version: string): { core: number[]; pre: string | null } {
    const [core, ...rest] = version.replace(/^v/, "").split("-");
    return { core: core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre: rest.length ? rest.join("-") : null };
}

export function compareVersions(a: string, b: string): number {
    const x = parts(a);
    const y = parts(b);
    for (let i = 0; i < Math.max(x.core.length, y.core.length); i++) {
        const d = (x.core[i] ?? 0) - (y.core[i] ?? 0);
        if (d !== 0) return d;
    }
    if (x.pre === y.pre) return 0;
    if (x.pre === null) return 1;
    if (y.pre === null) return -1;
    return x.pre < y.pre ? -1 : 1;
}

/** Releases after `lastSeen` up to and including `current`. A first launch (no lastSeen) has nothing to show. */
export function notesSince(entries: ChangelogEntry[], lastSeen: string | null, current: string): ChangelogEntry[] {
    if (lastSeen === null) return [];
    return entries.filter((e) => compareVersions(e.version, lastSeen) > 0 && compareVersions(e.version, current) <= 0);
}

/** Releases up to and including `current`: a changelog edited ahead of a bump must not show unreleased notes. */
export function releasedUpTo(entries: ChangelogEntry[], current: string): ChangelogEntry[] {
    return entries.filter((e) => compareVersions(e.version, current) <= 0);
}
