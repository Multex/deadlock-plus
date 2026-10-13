import { getContext, setContext } from "svelte";

export type OverlayHost = {
    /** The element dialogs are portalled into. Null until the app has mounted it. */
    readonly el: HTMLElement | null;
    /** Marks one dialog as open, with the function that closes it. Returns the function that marks it closed again. */
    track(close: () => void): () => void;
};

export type OverlayPlacement = {
    to: HTMLElement | "body";
    /** True when the dialog covers the host element only, so the rest of the app stays usable. */
    contained: boolean;
};

const KEY = Symbol("overlay-host");

/** Call during component initialisation, above every dialog that should open inside `host`. */
export function setOverlayHost(host: OverlayHost): void {
    setContext(KEY, host);
}

export function getOverlayHost(): OverlayHost | undefined {
    return getContext<OverlayHost | undefined>(KEY);
}

/** Where a dialog renders. Null means not yet: the app set a host whose element is not mounted. */
export function overlayPlacement(host: OverlayHost | undefined): OverlayPlacement | null {
    if (!host) return { to: "body", contained: false };
    if (!host.el) return null;
    return { to: host.el, contained: true };
}
