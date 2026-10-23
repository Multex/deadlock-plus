import { formatShownNumber } from "../number";

/** The text styles the game's description markup can ask for; class names kept as the game spells them. */
export type MarkupStyle =
    | "highlight"
    | "highlight_weapon"
    | "highlight_courage"
    | "highlight_tech"
    | "highlight_spirit"
    | "highlight_armor"
    | "highlight_fortitude"
    | "highlight_special"
    | "diminish"
    | "small_diminish"
    | "isNegative"
    | "bold"
    | "italic";

/**
 * A safe tree of the game's description markup. Nothing in it is HTML: a view renders each node as an element
 * of its own choosing, with text as text.
 */
export type MarkupNode =
    | { kind: "text"; text: string }
    | { kind: "span"; styles: MarkupStyle[]; children: MarkupNode[] }
    | { kind: "break" }
    /** A typed keyword drawn with its icon and colour. `label` is null when the game token was not resolved. */
    | { kind: "attribute"; name: string; label: string | null }
    /** An inline property icon, by its `prop_*` class without the prefix (`tech_damage`). */
    | { kind: "icon"; cssClass: string }
    /** A key binding, by the game's action name (`Mantle`). */
    | { kind: "binding"; action: string }
    /** A `{s:Name}` placeholder. `text` is empty when `values` has no number for it. */
    | { kind: "value"; name: string; value: number | null; signed: boolean; text: string };

const STYLE_CLASSES: Record<string, MarkupStyle> = {
    highlight: "highlight",
    highlight_weapon: "highlight_weapon",
    highlight_courage: "highlight_courage",
    highlight_tech: "highlight_tech",
    highlight_spirit: "highlight_spirit",
    highlight_armor: "highlight_armor",
    highlight_fortitude: "highlight_fortitude",
    highlight_special: "highlight_special",
    diminish: "diminish",
    small_diminish: "small_diminish",
    isNegative: "isNegative",
    italics: "italic",
};

const INLINE_ATTRIBUTE_CLASS = "inline-attribute-label";
const PROPERTY_ICON_CLASS = "AbilityPropertyIcon";

/** Shows a number the way the game's tooltips do: plain digits, no grouping, trailing zeros trimmed, ties to even. */
export function formatGameNumber(value: number, maxDecimals = 4): string {
    return formatShownNumber(value, maxDecimals);
}

type Frame = {
    tag: string;
    styles: MarkupStyle[];
    /** Set for an inline attribute span: its text content becomes the label. */
    attribute: string | null;
    children: MarkupNode[];
};

const TAG = /^<(\/?)([A-Za-z][A-Za-z0-9]*)((?:\s[^<>]*?)?)\s*(\/?)>/;
const PLACEHOLDER = /^\{[sdi](?::r)?:([A-Za-z0-9_]+)\}/;
const GAME_TOKEN = /^\{g:(citadel_inline_attribute|citadel_binding):'([A-Za-z0-9_]+)'\}/;
const ENTITY = /&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos|nbsp|#39));/gi;
const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function codePointText(code: number): string | null {
    return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : null;
}

function decodeEntities(text: string): string {
    return text.replace(ENTITY, (whole, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
        if (dec !== undefined) return codePointText(Number(dec)) ?? whole;
        if (hex !== undefined) return codePointText(parseInt(hex, 16)) ?? whole;
        if (name === "#39") return "'";
        return NAMED_ENTITIES[name?.toLowerCase() ?? ""] ?? whole;
    });
}

function classesOf(attributes: string): string[] {
    const unescaped = attributes.replace(/\\(["'])/g, "$1");
    const match = /class\s*=\s*(["'])(.*?)\1/.exec(unescaped);
    return match ? match[2].split(/\s+/).filter(Boolean) : [];
}

function pushText(into: MarkupNode[], value: string): void {
    if (value === "") return;
    const last = into.at(-1);
    if (last?.kind === "text") last.text += value;
    else into.push({ kind: "text", text: value });
}

function valueNode(name: string, values: Record<string, number>, signed: boolean): MarkupNode {
    const value = Object.hasOwn(values, name) ? values[name] : null;
    const digits = value === null ? "" : formatGameNumber(value);
    return { kind: "value", name, value, signed, text: signed && value !== null && value >= 0 ? `+${digits}` : digits };
}

/**
 * Parses a game description (`TooltipBlock.description`, hero ability text) into a {@link MarkupNode} tree.
 * Unknown tags and tokens stay as literal text; spans left open close at the end.
 */
export function parseMarkup(source: string, values: Record<string, number> = {}): MarkupNode[] {
    const root: Frame = { tag: "", styles: [], attribute: null, children: [] };
    const stack: Frame[] = [root];
    const top = () => stack[stack.length - 1];
    let pending = "";
    const flush = () => {
        pushText(top().children, decodeEntities(pending));
        pending = "";
    };
    const close = (frame: Frame) => {
        const node: MarkupNode =
            frame.attribute !== null
                ? { kind: "attribute", name: frame.attribute, label: markupText(frame.children) }
                : { kind: "span", styles: frame.styles, children: frame.children };
        top().children.push(node);
    };

    let i = 0;
    while (i < source.length) {
        const rest = source.slice(i);
        const char = source[i];

        if (char === "<") {
            const tag = TAG.exec(rest);
            const name = tag?.[2].toLowerCase();
            if (tag && name !== undefined && ["span", "b", "i", "br", "panel"].includes(name)) {
                flush();
                const [whole, closing, , attributes, selfClosing] = tag;
                i += whole.length;
                if (name === "br") {
                    top().children.push({ kind: "break" });
                } else if (name === "panel") {
                    const icon = closing ? undefined : classesOf(attributes).find((c) => c.startsWith("prop_"));
                    const isIcon = classesOf(attributes).includes(PROPERTY_ICON_CLASS);
                    if (isIcon && icon) top().children.push({ kind: "icon", cssClass: icon.slice("prop_".length) });
                } else if (closing) {
                    const at = stack.findLastIndex((f, index) => index > 0 && f.tag === name);
                    while (at > 0 && stack.length > at) {
                        const frame = stack.pop();
                        if (frame) close(frame);
                    }
                } else if (!selfClosing) {
                    const classes = name === "span" ? classesOf(attributes) : [];
                    const attribute = classes.includes(INLINE_ATTRIBUTE_CLASS)
                        ? (classes.find((c) => c !== INLINE_ATTRIBUTE_CLASS) ?? null)
                        : null;
                    const styles: MarkupStyle[] =
                        name === "b"
                            ? ["bold"]
                            : name === "i"
                              ? ["italic"]
                              : classes.flatMap((c) => (Object.hasOwn(STYLE_CLASSES, c) ? [STYLE_CLASSES[c]] : []));
                    stack.push({ tag: name, styles, attribute, children: [] });
                }
                continue;
            }
        }

        if (char === "{") {
            if (rest.startsWith("{s:sign}")) {
                const next = PLACEHOLDER.exec(rest.slice("{s:sign}".length));
                flush();
                if (next && next[1] !== "sign") {
                    top().children.push(valueNode(next[1], values, true));
                    i += "{s:sign}".length + next[0].length;
                } else {
                    i += "{s:sign}".length;
                }
                continue;
            }
            const placeholder = PLACEHOLDER.exec(rest);
            if (placeholder) {
                flush();
                top().children.push(valueNode(placeholder[1], values, false));
                i += placeholder[0].length;
                continue;
            }
            const token = GAME_TOKEN.exec(rest);
            if (token) {
                flush();
                top().children.push(
                    token[1] === "citadel_binding"
                        ? { kind: "binding", action: token[2] }
                        : { kind: "attribute", name: token[2], label: null },
                );
                i += token[0].length;
                continue;
            }
        }

        pending += char;
        i += 1;
    }

    flush();
    while (stack.length > 1) {
        const frame = stack.pop();
        if (frame) close(frame);
    }
    return root.children;
}

/** The plain text of a tree, for labels and accessible names. Bindings read as `[Action]`. */
export function markupText(nodes: readonly MarkupNode[]): string {
    return nodes
        .map((node) => {
            switch (node.kind) {
                case "text":
                case "value":
                    return node.text;
                case "span":
                    return markupText(node.children);
                case "break":
                    return "\n";
                case "attribute":
                    return node.label ?? node.name;
                case "icon":
                    return "";
                case "binding":
                    return `[${node.action}]`;
            }
        })
        .join("");
}
