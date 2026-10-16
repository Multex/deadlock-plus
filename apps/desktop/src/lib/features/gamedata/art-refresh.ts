import { tick } from "svelte";
import { command, listen, type Unlisten } from "$lib/core/tauri";

export type ArtReload = () => Promise<unknown>;

export interface ArtRefreshDeps {
    listen(handler: () => void): Promise<Unlisten>;
    release(): Promise<void>;
    /** Resolves once the UI shows what the reloads set. */
    rendered(): Promise<void>;
}

/**
 * The backend keeps the old build's art folder after a game update so images on screen stay valid. Every holder
 * of game-art paths reloads here; the old folder is released only once all of them hold new paths.
 */
export function createArtRefresh(deps: ArtRefreshDeps) {
    const holders = new Set<ArtReload>();
    let queue: Promise<void> = Promise.resolve();

    async function refresh() {
        const results = await Promise.allSettled([...holders].map((reload) => Promise.resolve().then(reload)));
        // A failed reload may still show old paths; keeping the old folder is the safe side.
        if (results.some((r) => r.status === "rejected")) return;
        await deps.rendered();
        await deps.release();
    }

    function onChange(reload: ArtReload): () => void {
        holders.add(reload);
        return () => holders.delete(reload);
    }

    return {
        onChange,
        /** Runs `load` now and again on every art change. */
        keep(load: ArtReload): () => void {
            void load();
            return onChange(load);
        },
        start(): () => void {
            let stopped = false;
            let unlisten: Unlisten | null = null;
            deps.listen(() => {
                queue = queue.then(refresh).catch(() => {});
            }).then(
                (fn) => {
                    if (stopped) fn();
                    else unlisten = fn;
                },
                () => {},
            );
            return () => {
                stopped = true;
                unlisten?.();
            };
        },
    };
}

export const gameArt = createArtRefresh({
    listen: (handler) => listen("game-art-changed", handler),
    release: () => command("release_old_game_art"),
    rendered: tick,
});

export const onGameArtChanged = gameArt.onChange;
export const keepGameArt = gameArt.keep;
