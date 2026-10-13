export type CloseOutcome = "cancel" | "none";

/** Any close that did not follow a confirm click (Esc, overlay, navigation) counts as cancel. */
export function closeOutcome(nextOpen: boolean, confirmed: boolean): CloseOutcome {
    if (nextOpen || confirmed) return "none";
    return "cancel";
}

export interface ConfirmHooks {
    close(): void;
    pending(on: boolean): void;
}

/**
 * Runs a confirm handler and closes the dialog once it has finished. A handler that throws or rejects
 * leaves the dialog open and its error reaches whoever awaits the run.
 */
export function confirmRunner(hooks: ConfirmHooks) {
    let opening = 0;
    let running = false;

    return {
        /** The dialog opened; a handler still running belongs to the previous opening and must not close this one. */
        opened() {
            opening += 1;
            if (running) hooks.pending(false);
            running = false;
        },

        async confirm(handler: (() => void | Promise<void>) | undefined): Promise<void> {
            if (running) return;
            const mine = opening;
            running = true;
            hooks.pending(true);
            try {
                await handler?.();
            } finally {
                if (mine === opening) {
                    running = false;
                    hooks.pending(false);
                }
            }
            if (mine === opening) hooks.close();
        },
    };
}
