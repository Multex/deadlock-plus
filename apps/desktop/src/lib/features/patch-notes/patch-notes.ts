import type { PatchDetail } from "@deadlock-plus/ipc-types/PatchDetail";
import type { PatchLine } from "@deadlock-plus/ipc-types/PatchLine";
import type { PatchOrigin } from "@deadlock-plus/ipc-types/PatchOrigin";
import type { PatchSearchResult } from "@deadlock-plus/ipc-types/PatchSearchResult";

export type { PatchDetail, PatchLine, PatchSearchResult };

export type PatchSection = { name: string; lines: PatchLine[] };

/** Groups consecutive lines under the same `[ Section ]` header, preserving body order. */
export function groupBySection(lines: PatchLine[]): PatchSection[] {
    const sections: PatchSection[] = [];
    for (const line of lines) {
        const current = sections.at(-1);
        if (current && current.name === line.section) current.lines.push(line);
        else sections.push({ name: line.section, lines: [line] });
    }
    return sections;
}

function stripBulletMarker(raw: string): string {
    return raw.replace(/^-\s*/, "");
}

/**
 * Splits a line's already-correct `raw` text into its subject prefix (for a bold lead-in) and the
 * rest, only when `subject` genuinely matches how `raw` starts. `subject` is a best-effort parse
 * hint (see `PatchLine`), so this never trusts it over `raw` for the actual wording.
 */
export function lineParts(line: PatchLine): { subject: string | null; rest: string } {
    const bullet = stripBulletMarker(line.raw);
    const prefix = line.subject ? `${line.subject}:` : null;
    if (prefix && bullet.startsWith(prefix)) {
        return { subject: line.subject, rest: bullet.slice(prefix.length).trim() };
    }
    return { subject: null, rest: bullet };
}

export type ContentState = "empty" | "shallow" | "full";

/**
 * "empty" (nothing indexed yet, still pending) and "shallow" (a forum link-unfurl preview that is
 * very unlikely to ever get fuller — no full-body source exists) render
 * differently: "empty" alone should read as "not indexed yet", "shallow" should show its real
 * (if incomplete) content with a link to read the rest on the forum.
 *
 * Driven by `origin`, not by scanning `raw` for a truncation marker like "...": a forum-only post's
 * `content` field genuinely never carries more than the forum's own link-unfurl preview (the
 * forum's API needs an admin-issued key and its thread pages sit behind a bot challenge, so no
 * data source supplies a fuller body), so every `Forum`-origin patch is shallow, full stop. The
 * old marker-based heuristic missed previews that got cut mid-sentence with no "..." at all,
 * silently showing them as complete notes.
 */
export function contentState(lines: PatchLine[], origin: PatchOrigin): ContentState {
    if (lines.length === 0) return "empty";
    return origin === "forum" ? "shallow" : "full";
}

/**
 * Whether the author actually wrote this line as a bullet (`- `), including one folded in from a
 * BBCode `[*]` list item (see `bbcode::strip_bbcode`). Free-form prose in a Major/Matchmaking
 * Update never gets this prefix. Derived from `raw` on the fly rather than stored on `PatchLine`:
 * it doesn't need backend persistence, and it must never become part of the shape compared when
 * deciding whether a cached line can be reused (see `merge_lines` in `store.rs`) — an earlier
 * version stored it as a real field and that alone made the entire index look changed, forcing a
 * full re-embed of every patch every place this field's default didn't match after a reload.
 */
function isBulletLine(line: PatchLine): boolean {
    return line.raw.startsWith("- ");
}

export type ContentRun = { bullet: boolean; lines: PatchLine[] };

/**
 * Groups consecutive lines by whether they're bulleted (`isBulletLine`) or free-form prose. A
 * balance patch is one long bullet run; a Major/Matchmaking Update's paragraphs are a run of
 * non-bullets. Keeps a mixed section (rare, but not impossible) visually sane either way.
 */
export function groupByBullet(lines: PatchLine[]): ContentRun[] {
    const runs: ContentRun[] = [];
    for (const line of lines) {
        const bullet = isBulletLine(line);
        const current = runs.at(-1);
        if (current && current.bullet === bullet) current.lines.push(line);
        else runs.push({ bullet, lines: [line] });
    }
    return runs;
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Renders the lightweight bold/italic markers `bbcode::strip_bbcode` emits for a real source
 * `[b]`/`[i]` span (`**bold**` / `_italic_`, chosen to match Markdown) as safe HTML. Every
 * character of `text` is HTML-escaped first, so the source content can never inject anything but
 * `<strong>`/`<em>` — the only tags this function ever produces itself.
 */
export function renderInline(text: string): string {
    return escapeHtml(text)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>");
}

/**
 * `bbcode::strip_bbcode` leaves this sentinel (U+FFFC, OBJECT REPLACEMENT CHARACTER) in place of
 * an `[img]` tag, on its own line, naming its index into `PatchDetail.images` — so an image
 * renders at the position it actually held in the body instead of every image being grouped at
 * the top of the post regardless of where it sat.
 */
const IMAGE_MARKER_RE = /^￼(\d+)￼$/;

/** The `images` index a line's `raw` names, or `null` when it's real content, not a marker. */
export function imageMarkerIndex(raw: string): number | null {
    const match = IMAGE_MARKER_RE.exec(raw);
    return match ? Number(match[1]) : null;
}

export type SubjectGroup = { subject: string | null; items: string[] };

/**
 * Groups consecutive lines that share the same real subject (e.g. three separate "Spiritual
 * Overflow" bullets) so the subject is shown once instead of repeated on every line. Lines with no
 * subject, or an isolated single-line subject, each become their own one-item group.
 */
export function groupBySubject(lines: PatchLine[]): SubjectGroup[] {
    const groups: SubjectGroup[] = [];
    for (const line of lines) {
        const { subject, rest } = lineParts(line);
        const current = groups.at(-1);
        if (current && subject !== null && current.subject === subject) current.items.push(rest);
        else groups.push({ subject, items: [rest] });
    }
    return groups;
}
