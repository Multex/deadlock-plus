// Imported by path, not by package name: the release workflow runs this from a sparse checkout with no install.
import {
    MAX_COMPONENTS,
    MAX_MESSAGE_TEXT,
    clip,
    container,
    linkButton,
    message,
    section,
    separator,
    text,
} from "../../packages/discord-messages/src/index.ts";

const MAX_LINE = 300;
const FOOTER = "-# Deadlock+ checks for updates on its own. You can also download it from the release page.";
const BULLET = /^([-*+]|\d+[.)])\s/;
const STRENGTH = { section: 0, group: 1, item: 2 };
// A weaker boundary (group, then bullet) is used only when the stronger one would leave the message under half full.
const MIN_FILL = 0.5;

/**
 * Splits changelog notes into the units a message may start at: `###` sections, `####` groups (as bold lines)
 * and items. An item is a bullet together with any wrapped lines under it, so it is never split.
 */
function units(notes) {
    const out = [];
    let title;
    let group;
    for (const raw of notes.split(/\r?\n/)) {
        const line = raw.trim();
        if (line === "") continue;
        if (line.startsWith("### ")) {
            title = line.slice(4).trim();
            group = undefined;
            out.push({ kind: "section", title });
        } else if (title === undefined) {
            continue;
        } else if (line.startsWith("#### ")) {
            group = { kind: "group", title, text: `**${line.slice(5).trim()}**` };
            out.push(group);
        } else if (!BULLET.test(line) && out.at(-1).kind === "item") {
            out.at(-1).lines.push(clip(line, MAX_LINE));
        } else {
            out.push({ kind: "item", title, group, lines: [clip(line, MAX_LINE)] });
        }
    }
    return out;
}

/** One text block per section in `list[start..end)`, repeating the section title and group heading it continues. */
function blocks(list, start, end) {
    const out = [];
    let current;
    const first = list[start];
    if (first && first.kind !== "section") {
        current = { title: first.title, lines: [] };
        out.push(current);
        if (first.kind === "item" && first.group) current.lines.push(first.group.text);
    }
    for (const unit of list.slice(start, end)) {
        if (unit.kind === "section") {
            current = { title: unit.title, lines: [] };
            out.push(current);
        } else if (unit.kind === "group") {
            current.lines.push(unit.text);
        } else {
            current.lines.push(...unit.lines);
        }
    }
    return out.map(({ title, lines }) => text([`### ${title}`, ...lines].join("\n")));
}

function compose(body, header, last) {
    const components = [];
    if (header) {
        components.push(header);
        if (body.length > 0) components.push(separator());
    }
    components.push(...body);
    if (last) components.push(separator(), text(FOOTER));
    return message("Deadlock+", [container(components)]);
}

function textLength(components) {
    return components.reduce(
        (n, c) => n + (c.type === 10 ? c.content.length : 0) + (c.components ? textLength(c.components) : 0),
        0,
    );
}

function componentCount(components) {
    return components.reduce(
        (n, c) => n + 1 + (c.components ? componentCount(c.components) : 0) + (c.accessory ? 1 : 0),
        0,
    );
}

function fits(msg) {
    return textLength(msg.components) <= MAX_MESSAGE_TEXT && componentCount(msg.components) <= MAX_COMPONENTS;
}

/** Where the message starting at `start` should end: the strongest boundary that still fills it well. */
function nextBreak(list, start, build) {
    const fitting = [];
    for (let end = start + 1; end < list.length; end += 1) {
        const part = build(start, end, false);
        if (!fits(part)) break;
        if (list[end - 1].kind === "item") {
            fitting.push({ end, strength: STRENGTH[list[end].kind], size: textLength(part.components) });
        }
    }
    if (fitting.length === 0) throw new Error("A changelog entry is too long for one Discord message");
    const fullest = fitting.at(-1).size;
    for (const strength of [STRENGTH.section, STRENGTH.group]) {
        const pick = fitting.findLast((f) => f.strength <= strength && f.size >= fullest * MIN_FILL);
        if (pick) return pick.end;
    }
    return fitting.at(-1).end;
}

/**
 * The announcement as one or more webhook messages, to be posted in order. Notes too long for one message continue
 * in the next; only the first has the version header and only the last has the footer.
 */
export function render({ tag, url, notes }) {
    const version = tag.replace(/^v/, "");
    const header = section(text(`## Deadlock+ ${version}\nA new version is out.`), linkButton("Release notes", url));
    const list = units(notes);
    const build = (start, end, last) => compose(blocks(list, start, end), start === 0 ? header : undefined, last);

    const parts = [];
    let start = 0;
    for (;;) {
        const rest = build(start, list.length, true);
        if (fits(rest)) {
            parts.push(rest);
            return parts;
        }
        const end = nextBreak(list, start, build);
        parts.push(build(start, end, false));
        start = end;
    }
}
