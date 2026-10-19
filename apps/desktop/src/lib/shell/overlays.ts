export type CloseFn = () => void;

export function createOverlays() {
    const entries = new Set<{ close: CloseFn }>();

    return {
        register(close: CloseFn): () => void {
            const entry = { close };
            entries.add(entry);
            return () => void entries.delete(entry);
        },
        closeAll() {
            for (const entry of [...entries]) entry.close();
        },
        /** Returns a function that closes the overlays open now and still open when it is called. */
        snapshot(): () => void {
            const open = [...entries];
            return () => {
                for (const entry of open) if (entries.has(entry)) entry.close();
            };
        },
        get size() {
            return entries.size;
        },
    };
}

export const overlays = createOverlays();
