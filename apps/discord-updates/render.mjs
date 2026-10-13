// Imported by path, not by package name: the release workflow runs this from a sparse checkout with no install.
import {
    MAX_MESSAGE_TEXT,
    clip,
    container,
    linkButton,
    message,
    section,
    separator,
    text,
} from "../../packages/discord-messages/src/index.ts";

// Leaves room for the header and the footer.
const TEXT_BUDGET = MAX_MESSAGE_TEXT - 400;
const MAX_LINE = 300;

/** Splits changelog notes into `###` sections of display lines. `####` groups become bold lines. */
export function sections(notes) {
    const out = [];
    let current;
    for (const raw of notes.split(/\r?\n/)) {
        const line = raw.trim();
        if (line === "") continue;
        if (line.startsWith("### ")) {
            current = { title: line.slice(4).trim(), lines: [] };
            out.push(current);
        } else if (current && line.startsWith("#### ")) {
            current.lines.push(`**${line.slice(5).trim()}**`);
        } else if (current) {
            current.lines.push(clip(line, MAX_LINE));
        }
    }
    return out;
}

function fit(list) {
    let left = TEXT_BUDGET;
    return list.map(({ title, lines }) => {
        const kept = [];
        let cut = 0;
        left -= title.length + 5;
        for (const line of lines) {
            if (left - line.length - 1 >= 60) {
                kept.push(line);
                left -= line.length + 1;
            } else {
                cut += 1;
            }
        }
        if (cut > 0) kept.push(`-# …and ${cut} more`);
        return { title, lines: kept };
    });
}

export function render({ tag, url, notes }) {
    const version = tag.replace(/^v/, "");
    const header = section(text(`## Deadlock+ ${version}\nA new version is out.`), linkButton("Release notes", url));

    const blocks = fit(sections(notes)).map(({ title, lines }) => text([`### ${title}`, ...lines].join("\n")));

    const components = [header];
    if (blocks.length > 0) components.push(separator(), ...blocks);
    components.push(
        separator(),
        text("-# Deadlock+ checks for updates on its own. You can also download it from the release page."),
    );

    return message("Deadlock+", [container(components)]);
}
