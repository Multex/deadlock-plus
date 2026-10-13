// Node imports this file as it is and only strips the types: no enums, namespaces, parameter
// properties or imports of other files without their `.ts` extension.

export const COMPONENTS_V2 = 1 << 15;
export const BLURPLE = 0x5865f2;
/** Discord's cap on the text of one message, summed over all its text displays. */
export const MAX_MESSAGE_TEXT = 4000;
/** Discord's cap on the components of one message, nested ones included. */
export const MAX_COMPONENTS = 40;

export interface TextDisplay {
    type: 10;
    content: string;
}

export interface Separator {
    type: 14;
    divider: true;
    spacing: 1;
}

export interface LinkButton {
    type: 2;
    style: 5;
    label: string;
    url: string;
}

export interface Section {
    type: 9;
    components: TextDisplay[];
    accessory: LinkButton;
}

export type ContainerChild = TextDisplay | Separator | Section;

export interface Container {
    type: 17;
    accent_color: number;
    components: ContainerChild[];
}

export interface Message {
    username: string;
    flags: number;
    allowed_mentions: { parse: never[] };
    components: Container[];
}

export function text(content: string): TextDisplay {
    return { type: 10, content };
}

export function separator(): Separator {
    return { type: 14, divider: true, spacing: 1 };
}

export function linkButton(label: string, url: string): LinkButton {
    return { type: 2, style: 5, label, url };
}

export function section(body: TextDisplay, accessory: LinkButton): Section {
    return { type: 9, components: [body], accessory };
}

export function container(components: ContainerChild[], accent: number = BLURPLE): Container {
    return { type: 17, accent_color: accent, components };
}

/** A webhook message that mentions nobody, whatever its text contains. */
export function message(username: string, components: Container[]): Message {
    return { username, flags: COMPONENTS_V2, allowed_mentions: { parse: [] }, components };
}

/** Cuts `text` to at most `max` UTF-16 units, ending in an ellipsis and never in half a surrogate pair. */
export function clip(text: string, max: number): string {
    if (text.length <= max) return text;
    let cut = text.slice(0, max - 1);
    const last = cut.charCodeAt(cut.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
    return `${cut}…`;
}

/** Wraps `text` in backticks, at most `max` units long with both fences. Backticks inside become apostrophes. */
export function inlineCode(text: string, max: number): string {
    return `\`${clip(text.replaceAll("`", "'"), max - 2)}\``;
}
