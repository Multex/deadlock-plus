export interface Focusable {
    focus(): void;
}

export interface TakeoverKey {
    key: string;
    shiftKey: boolean;
    preventDefault(): void;
}

export interface TakeoverDeps<T extends Focusable> {
    activeElement(): T | null;
    onChange(open: boolean): void;
    /** Runs `fn` once the closed takeover has left the page. */
    afterClose(fn: () => void): void;
}

export interface Takeover<T extends Focusable> {
    readonly open: boolean;
    show(): void;
    close(): void;
    /** `focusables` are the takeover's own, in tab order. */
    keydown(e: TakeoverKey, focusables: readonly T[], active: T | null): void;
}

export function createTakeover<T extends Focusable>(deps: TakeoverDeps<T>): Takeover<T> {
    let open = false;
    let returnTo: T | null = null;

    const close = () => {
        if (!open) return;
        open = false;
        const target = returnTo;
        returnTo = null;
        deps.onChange(false);
        deps.afterClose(() => target?.focus());
    };

    return {
        get open() {
            return open;
        },
        show() {
            if (open) return;
            returnTo = deps.activeElement();
            open = true;
            deps.onChange(true);
        },
        close,
        keydown(e, focusables, active) {
            if (!open) return;
            if (e.key === "Escape") {
                e.preventDefault();
                close();
                return;
            }
            if (e.key !== "Tab") return;
            const at = active === null ? -1 : focusables.indexOf(active);
            const last = focusables.length - 1;
            if (focusables.length === 0) {
                e.preventDefault();
            } else if (e.shiftKey && at <= 0) {
                e.preventDefault();
                focusables[last].focus();
            } else if (!e.shiftKey && (at < 0 || at === last)) {
                e.preventDefault();
                focusables[0].focus();
            }
        },
    };
}
