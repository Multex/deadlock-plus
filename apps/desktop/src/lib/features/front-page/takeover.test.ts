import { describe, expect, it } from "vitest";
import { createTakeover, type Focusable, type TakeoverKey } from "./takeover";

class El implements Focusable {
    constructor(
        readonly name: string,
        private log: string[],
    ) {}
    focus() {
        this.log.push(`focus ${this.name}`);
    }
}

function setup(active: El | null = null) {
    const log: string[] = [];
    const later: (() => void)[] = [];
    let focused = active;
    const takeover = createTakeover<El>({
        activeElement: () => focused,
        onChange: (open) => log.push(open ? "open" : "closed"),
        afterClose: (fn) => later.push(fn),
    });
    const flush = () => later.splice(0).forEach((fn) => fn());
    const el = (name: string) => new El(name, log);
    return { log, takeover, flush, el, setFocused: (e: El | null) => (focused = e) };
}

function key(k: string, shiftKey = false): TakeoverKey & { prevented: boolean } {
    return {
        key: k,
        shiftKey,
        prevented: false,
        preventDefault() {
            this.prevented = true;
        },
    };
}

describe("createTakeover", () => {
    it("opens once", () => {
        const { takeover, log } = setup();
        takeover.show();
        takeover.show();
        expect(takeover.open).toBe(true);
        expect(log).toEqual(["open"]);
    });

    it("closes and gives the focus back to what had it before opening, after it has left the page", () => {
        const { takeover, log, flush, el, setFocused } = setup();
        const button = el("button");
        setFocused(button);
        takeover.show();
        setFocused(el("close"));
        takeover.close();
        expect(takeover.open).toBe(false);
        expect(log).toEqual(["open", "closed"]);
        flush();
        expect(log).toEqual(["open", "closed", "focus button"]);
    });

    it("ignores a close while closed", () => {
        const { takeover, log, flush } = setup();
        takeover.close();
        flush();
        expect(log).toEqual([]);
    });

    it("closes on Escape", () => {
        const { takeover, log, el } = setup();
        takeover.show();
        const e = key("Escape");
        takeover.keydown(e, [el("a")], null);
        expect(e.prevented).toBe(true);
        expect(takeover.open).toBe(false);
        expect(log).toEqual(["open", "closed"]);
    });

    it("keeps Tab inside the takeover", () => {
        const { takeover, log, el } = setup();
        const [a, b, c] = [el("a"), el("b"), el("c")];
        takeover.show();

        const last = key("Tab");
        takeover.keydown(last, [a, b, c], c);
        expect(last.prevented).toBe(true);

        const first = key("Tab", true);
        takeover.keydown(first, [a, b, c], a);
        expect(first.prevented).toBe(true);

        const outside = key("Tab");
        takeover.keydown(outside, [a, b, c], null);
        expect(outside.prevented).toBe(true);

        const middle = key("Tab");
        takeover.keydown(middle, [a, b, c], b);
        expect(middle.prevented).toBe(false);

        expect(log).toEqual(["open", "focus a", "focus c", "focus a"]);
    });

    it("leaves keys alone while closed", () => {
        const { takeover, log, el } = setup();
        const e = key("Escape");
        takeover.keydown(e, [el("a")], null);
        expect(e.prevented).toBe(false);
        expect(log).toEqual([]);
    });
});
