import type { PollerEnv } from "./poller";
import { command, listen, type Unlisten } from "./tauri";

export interface VisibilityDocument {
    visibilityState: DocumentVisibilityState;
    addEventListener(type: "visibilitychange", cb: () => void): void;
    removeEventListener(type: "visibilitychange", cb: () => void): void;
}

export interface WindowVisibilityDeps {
    command(name: "main_window_visible"): Promise<boolean>;
    listen(event: "window-shown" | "window-hidden", handler: () => void): Promise<Unlisten>;
    document: VisibilityDocument | undefined;
}

/**
 * WebView2 never fires `visibilitychange` on minimize or hide-to-tray, so the backend's view of the
 * main window decides too. The document still counts: browsers, the demo and e2e specs only have it.
 */
export function createWindowVisibility(deps: WindowVisibilityDeps): PollerEnv {
    const listeners = new Set<() => void>();
    let started = false;
    let backendFailed = false;
    let heardEvent = false;
    let windowVisible: boolean | null = null;
    let lastHidden = false;

    const isHidden = () => windowVisible === false || deps.document?.visibilityState === "hidden";

    const update = () => {
        const hidden = isHidden();
        if (hidden === lastHidden) return;
        lastHidden = hidden;
        for (const cb of [...listeners]) cb();
    };

    const setWindowVisible = (visible: boolean | null) => {
        windowVisible = visible;
        update();
    };

    const dropBackend = () => {
        backendFailed = true;
        setWindowVisible(null);
    };

    const onEvent = (visible: boolean) => () => {
        if (backendFailed) return;
        heardEvent = true;
        setWindowVisible(visible);
    };

    const start = () => {
        if (started) return;
        started = true;
        lastHidden = isHidden();
        deps.document?.addEventListener("visibilitychange", update);
        deps.listen("window-shown", onEvent(true)).catch(dropBackend);
        deps.listen("window-hidden", onEvent(false)).catch(dropBackend);
        deps.command("main_window_visible").then((visible) => {
            if (!backendFailed && !heardEvent) setWindowVisible(visible);
        }, dropBackend);
    };

    return {
        isHidden() {
            start();
            return isHidden();
        },
        onVisibilityChange(cb) {
            start();
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
    };
}

export const windowVisibility = createWindowVisibility({
    command: (name) => command<boolean>(name),
    listen: (event, handler) => listen(event, handler),
    document: typeof document === "undefined" ? undefined : document,
});
