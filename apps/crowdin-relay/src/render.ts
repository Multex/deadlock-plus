import {
    type ContainerChild,
    type Message,
    type TextDisplay,
    clip as clipTo,
    container,
    inlineCode,
    linkButton,
    message,
    section,
    separator,
    text,
} from "@deadlock-plus/discord-messages";

type Json = Record<string, unknown>;

const MAX_TEXT = 1000;

function obj(value: unknown): Json | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : undefined;
}

function str(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
}

function first(...values: unknown[]): string | undefined {
    for (const value of values) {
        const s = str(value);
        if (s !== undefined) return s;
    }
    return undefined;
}

function clip(value: string, max = MAX_TEXT): string {
    return clipTo(value, max);
}

function code(value: string): string {
    return inlineCode(value, MAX_TEXT);
}

function humanise(event: string): string {
    const words = event
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[._]+/g, " ")
        .trim()
        .toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

function field(label: string, value: string | undefined): TextDisplay | undefined {
    return value === undefined ? undefined : text(`**${label}**\n${value}`);
}

function plain(value: string | undefined): string | undefined {
    return value === undefined ? undefined : clip(value);
}

function person(user: Json | undefined): string | undefined {
    return plain(first(user?.fullName, user?.username));
}

function language(lang: Json | undefined): string | undefined {
    const name = first(lang?.name);
    const locale = first(lang?.locale);
    if (name && locale) return clip(`${name} (\`${locale}\`)`);
    return plain(name ?? locale);
}

function editorLink(project: Json | undefined, lang: Json | undefined): string | undefined {
    const identifier = first(project?.identifier);
    const editorCode = first(lang?.editorCode);
    if (!identifier || !editorCode) return undefined;
    const source = first(project?.sourceLanguageId) ?? "en";
    return `https://crowdin.com/editor/${encodeURIComponent(identifier)}/all/${encodeURIComponent(source)}-${encodeURIComponent(editorCode)}`;
}

interface Body {
    fields: (TextDisplay | undefined)[];
    link?: string;
}

function fileBody(event: Json, file: Json): Body {
    const project = obj(file.project);
    const lang = obj(event.targetLanguage);
    const path = first(file.path);
    return {
        fields: [
            field("Project", plain(first(project?.name))),
            field("Language", language(lang)),
            field("File", path === undefined ? undefined : code(path)),
        ],
        link: editorLink(project, lang),
    };
}

function suggestionBody(event: Json, translation: Json): Body {
    const string = obj(translation.string);
    const project = obj(string?.project);
    const lang = obj(translation.targetLanguage);
    const key = first(string?.key, string?.identifier);
    return {
        fields: [
            field("Project", plain(first(project?.name))),
            field("Language", language(lang)),
            field("Key", key === undefined ? undefined : code(key)),
            field("Source", plain(first(string?.text))),
            field("Translation", plain(first(translation.text))),
            field("Author", person(obj(translation.user))),
            field("Reviewer", person(obj(event.user))),
        ],
        link: first(string?.url) ?? editorLink(project, lang),
    };
}

function stringBody(event: Json, source: Json): Body {
    const key = first(source.key, source.identifier);
    const path = first(obj(source.file)?.path);
    return {
        fields: [
            field("Project", plain(first(obj(source.project)?.name))),
            field("File", path === undefined ? undefined : code(path)),
            field("Key", key === undefined ? undefined : code(key)),
            field("Source", plain(first(source.text))),
            field("Context", plain(first(source.context))),
            field("By", person(obj(event.user))),
        ],
        link: first(source.url),
    };
}

function fallbackBody(event: Json): Body {
    return { fields: [field("Project", plain(first(obj(event.project)?.name)))] };
}

function bodyFor(event: Json): Body {
    const file = obj(event.file);
    if (file) return fileBody(event, file);
    const translation = obj(event.translation);
    if (translation) return suggestionBody(event, translation);
    const source = obj(event.string);
    if (source) return stringBody(event, source);
    return fallbackBody(event);
}

export function render(payload: unknown): Message {
    const event = obj(payload) ?? {};
    const name = first(event.event);
    const header = text(`### ${clip(name ? humanise(name) : "Crowdin event", 200)}`);
    const body = bodyFor(event);
    const fields = body.fields.filter((f): f is TextDisplay => f !== undefined);

    const components: ContainerChild[] = [
        body.link ? section(header, linkButton("Open in editor", body.link)) : header,
    ];
    if (fields.length > 0) components.push(separator(), ...fields);

    return message("Crowdin", [container(components)]);
}
