const FRAMES = 10;

/**
 * Call when a dialog opens, before it takes focus; call the result when it closes. A dialog in the overlay host
 * makes the page under it inert, and bits-ui hands focus back while the page is still inert, so focus drops to the
 * body. This gives it back to the control that had it once the page is live again. Focus that has already left
 * the dialog for somewhere else stays where it went.
 */
export function holdFocusOrigin(): () => void {
    const active = document.activeElement;
    const origin = active instanceof HTMLElement && active !== document.body ? active : null;
    return () => {
        if (!origin) return;
        const closing = document.activeElement?.closest("[role=dialog], [role=alertdialog]") ?? null;
        const lost = () => {
            const now = document.activeElement;
            return !now || now === document.body || !now.isConnected || (closing?.contains(now) ?? false);
        };
        let frames = 0;
        const tryReturn = () => {
            if (!origin.isConnected || !lost()) return;
            origin.focus({ preventScroll: true });
            if (document.activeElement !== origin && ++frames < FRAMES) requestAnimationFrame(tryReturn);
        };
        requestAnimationFrame(tryReturn);
    };
}
