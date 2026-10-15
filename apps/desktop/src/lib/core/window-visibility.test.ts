import { describe, expect, it, vi } from "vitest";

import { createWindowVisibility, type VisibilityDocument } from "./window-visibility";

function fakeDocument(initial: DocumentVisibilityState = "visible") {
    const listeners = new Set<() => void>();
    const doc: VisibilityDocument = {
        visibilityState: initial,
        addEventListener: (_type, cb) => listeners.add(cb),
        removeEventListener: (_type, cb) => listeners.delete(cb),
    };
    return {
        doc,
        listeners,
        set(state: DocumentVisibilityState) {
            doc.visibilityState = state;
            for (const cb of [...listeners]) cb();
        },
    };
}

function fakeBackend() {
    const handlers = new Map<string, () => void>();
    let answer!: { resolve(visible: boolean): void; reject(e: unknown): void };
    const command = vi.fn(
        () =>
            new Promise<boolean>((resolve, reject) => {
                answer = { resolve, reject };
            }),
    );
    const listen = vi.fn(async (event: string, handler: () => void) => {
        handlers.set(event, handler);
        return () => handlers.delete(event);
    });
    return {
        command,
        listen,
        emit: (event: string) => handlers.get(event)?.(),
        answer: (visible: boolean) => answer.resolve(visible),
        fail: () => answer.reject(new Error("not in tauri")),
    };
}

function setup(initial: DocumentVisibilityState = "visible") {
    const document = fakeDocument(initial);
    const backend = fakeBackend();
    const env = createWindowVisibility({ command: backend.command, listen: backend.listen, document: document.doc });
    const changed = vi.fn();
    return { env, document, backend, changed };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("window visibility", () => {
    it("uses the document state until the backend answers", () => {
        const { env } = setup("hidden");
        expect(env.isHidden()).toBe(true);
    });

    it("asks the backend for the current state once", async () => {
        const { env, backend } = setup();
        env.isHidden();
        env.onVisibilityChange(() => {});
        env.onVisibilityChange(() => {});
        await settle();
        expect(backend.command).toHaveBeenCalledTimes(1);
        expect(backend.command).toHaveBeenCalledWith("main_window_visible");
    });

    it("is hidden and notifies when the backend says the window starts hidden", async () => {
        const { env, backend, changed } = setup();
        env.onVisibilityChange(changed);
        backend.answer(false);
        await settle();
        expect(env.isHidden()).toBe(true);
        expect(changed).toHaveBeenCalledTimes(1);
    });

    it("follows window-hidden and window-shown although the document stays visible", async () => {
        const { env, backend, changed } = setup();
        env.onVisibilityChange(changed);
        backend.answer(true);
        await settle();

        backend.emit("window-hidden");
        expect(env.isHidden()).toBe(true);
        backend.emit("window-shown");
        expect(env.isHidden()).toBe(false);
        expect(changed).toHaveBeenCalledTimes(2);
    });

    it("is hidden when the document is hidden while the backend says visible", async () => {
        const { env, backend, document, changed } = setup();
        env.onVisibilityChange(changed);
        backend.answer(true);
        await settle();

        document.set("hidden");
        expect(env.isHidden()).toBe(true);
        expect(changed).toHaveBeenCalledTimes(1);
    });

    it("notifies only when the combined state changes", async () => {
        const { env, backend, document, changed } = setup();
        env.onVisibilityChange(changed);
        backend.answer(true);
        await settle();

        backend.emit("window-shown");
        backend.emit("window-hidden");
        document.set("hidden");
        document.set("visible");
        expect(env.isHidden()).toBe(true);
        expect(changed).toHaveBeenCalledTimes(1);
    });

    it("lets a backend event win over a late answer to the first query", async () => {
        const { env, backend } = setup();
        env.isHidden();
        await settle();
        backend.emit("window-hidden");
        backend.answer(true);
        await settle();
        expect(env.isHidden()).toBe(true);
    });

    it("falls back to the document alone when the command fails", async () => {
        const { env, backend, document, changed } = setup();
        env.onVisibilityChange(changed);
        backend.fail();
        await settle();

        backend.emit("window-hidden");
        expect(env.isHidden()).toBe(false);
        document.set("hidden");
        expect(env.isHidden()).toBe(true);
        expect(changed).toHaveBeenCalledTimes(1);
    });

    it("falls back to the document alone when listening fails", async () => {
        const { env, backend, document } = setup();
        backend.listen.mockRejectedValue(new Error("not in tauri"));
        env.isHidden();
        backend.answer(false);
        await settle();

        expect(env.isHidden()).toBe(false);
        document.set("hidden");
        expect(env.isHidden()).toBe(true);
    });

    it("stops notifying after unsubscribe", async () => {
        const { env, backend, changed } = setup();
        const unsubscribe = env.onVisibilityChange(changed);
        backend.answer(true);
        await settle();

        unsubscribe();
        backend.emit("window-hidden");
        expect(changed).not.toHaveBeenCalled();
    });

    it("works without a document", async () => {
        const backend = fakeBackend();
        const env = createWindowVisibility({ command: backend.command, listen: backend.listen, document: undefined });
        expect(env.isHidden()).toBe(false);
        backend.answer(false);
        await settle();
        expect(env.isHidden()).toBe(true);
    });
});
