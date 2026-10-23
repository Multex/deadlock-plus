const MARK = "\u0000";

/** The translated text before and after a placeholder, so a control can stand in for the value. */
export function textAround(render: (value: string) => string): [before: string, after: string] {
    const text = render(MARK);
    const at = text.indexOf(MARK);
    return at < 0 ? [text, ""] : [text.slice(0, at), text.slice(at + MARK.length)];
}
