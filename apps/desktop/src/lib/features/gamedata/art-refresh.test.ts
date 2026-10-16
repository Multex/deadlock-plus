import { describe, expect, it, vi } from "vitest";
import { createArtRefresh, type ArtRefreshDeps } from "./art-refresh";

vi.mock("$lib/core/tauri", () => ({ command: vi.fn(), listen: vi.fn() }));

function deferred<T = void>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function setup() {
    let fire: (() => void) | null = null;
    const unlisten = vi.fn();
    const steps: string[] = [];
    const deps: ArtRefreshDeps = {
        listen: vi.fn(async (handler: () => void) => {
            fire = handler;
            return unlisten;
        }),
        release: vi.fn(async () => void steps.push("release")),
        rendered: vi.fn(async () => void steps.push("rendered")),
    };
    const art = createArtRefresh(deps);
    const stop = art.start();
    const emit = async () => {
        await vi.waitFor(() => expect(fire).not.toBeNull());
        fire!();
    };
    return { art, deps, stop, emit, unlisten, steps };
}

describe("createArtRefresh", () => {
    it("reloads every holder when the game art changes", async () => {
        const { art, emit, deps } = setup();
        const a = vi.fn(async () => {});
        const b = vi.fn(async () => {});
        art.onChange(a);
        art.onChange(b);
        await emit();
        await vi.waitFor(() => expect(deps.release).toHaveBeenCalledTimes(1));
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
    });

    it("releases the old folder only after every reload settled and the UI rendered", async () => {
        const { art, emit, deps, steps } = setup();
        const slow = deferred();
        art.onChange(async () => void steps.push("fast"));
        art.onChange(() => slow.promise.then(() => void steps.push("slow")));
        await emit();
        await vi.waitFor(() => expect(steps).toContain("fast"));
        await new Promise((r) => setTimeout(r, 0));
        expect(deps.release).not.toHaveBeenCalled();
        slow.resolve();
        await vi.waitFor(() => expect(deps.release).toHaveBeenCalledTimes(1));
        expect(steps).toEqual(["fast", "slow", "rendered", "release"]);
    });

    it("keeps the old folder when a reload fails", async () => {
        const { art, emit, deps } = setup();
        const ok = vi.fn(async () => {});
        art.onChange(ok);
        art.onChange(async () => {
            throw new Error("extract failed");
        });
        await emit();
        await vi.waitFor(() => expect(ok).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 0));
        expect(deps.release).not.toHaveBeenCalled();
    });

    it("keeps the old folder when a reload throws before returning a promise", async () => {
        const { art, emit, deps } = setup();
        art.onChange(() => {
            throw new Error("boom");
        });
        await emit();
        await new Promise((r) => setTimeout(r, 0));
        expect(deps.rendered).not.toHaveBeenCalled();
        expect(deps.release).not.toHaveBeenCalled();
    });

    it("skips a holder that stopped listening", async () => {
        const { art, emit, deps } = setup();
        const gone = vi.fn(async () => {});
        art.onChange(gone)();
        await emit();
        await vi.waitFor(() => expect(deps.release).toHaveBeenCalled());
        expect(gone).not.toHaveBeenCalled();
    });

    it("runs a second change after the first one finished", async () => {
        const { art, emit, deps } = setup();
        const first = deferred();
        let calls = 0;
        art.onChange(() => (++calls === 1 ? first.promise : Promise.resolve()));
        await emit();
        await emit();
        await new Promise((r) => setTimeout(r, 0));
        expect(calls).toBe(1);
        first.resolve();
        await vi.waitFor(() => expect(deps.release).toHaveBeenCalledTimes(2));
        expect(calls).toBe(2);
    });

    it("stops listening when stopped", async () => {
        const { stop, unlisten, deps } = setup();
        await vi.waitFor(() => expect(deps.listen).toHaveBeenCalled());
        await Promise.resolve();
        stop();
        expect(unlisten).toHaveBeenCalledTimes(1);
    });

    it("loads at once and again on each change with keep", async () => {
        const { art, emit, deps } = setup();
        const load = vi.fn(async () => {});
        const stop = art.keep(load);
        expect(load).toHaveBeenCalledTimes(1);
        await emit();
        await vi.waitFor(() => expect(deps.release).toHaveBeenCalledTimes(1));
        expect(load).toHaveBeenCalledTimes(2);
        stop();
        await emit();
        await vi.waitFor(() => expect(deps.release).toHaveBeenCalledTimes(2));
        expect(load).toHaveBeenCalledTimes(2);
    });
});
