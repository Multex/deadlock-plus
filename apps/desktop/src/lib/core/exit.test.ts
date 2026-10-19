import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const command = vi.fn();
const listen = vi.fn();
vi.mock("./tauri", () => ({
    command: (...args: unknown[]) => command(...args),
    listen: (...args: unknown[]) => listen(...args),
}));

import { listenForQuit, onBeforeExit, QUIT_REQUESTED_EVENT, runBeforeExit } from "./exit";

describe("before-exit tasks", () => {
    const removers: (() => void)[] = [];
    const register = (task: () => unknown) => removers.push(onBeforeExit(task));

    beforeEach(() => {
        command.mockReset().mockResolvedValue(undefined);
        listen.mockReset();
    });

    afterEach(() => {
        for (const remove of removers.splice(0)) remove();
    });

    it("waits for every registered task", async () => {
        const done: string[] = [];
        register(async () => {
            await Promise.resolve();
            done.push("a");
        });
        register(() => done.push("b"));
        await runBeforeExit();
        expect(done.sort()).toEqual(["a", "b"]);
    });

    it("runs the rest when one task fails", async () => {
        const ran = vi.fn();
        register(async () => {
            throw new Error("save failed");
        });
        register(ran);
        await expect(runBeforeExit()).resolves.toBeUndefined();
        expect(ran).toHaveBeenCalledOnce();
    });

    it("skips a removed task", async () => {
        const ran = vi.fn();
        onBeforeExit(ran)();
        await runBeforeExit();
        expect(ran).not.toHaveBeenCalled();
    });

    it("answers a quit request only after the tasks finish", async () => {
        let handler: () => void = () => {};
        listen.mockImplementation(async (event: string, cb: () => void) => {
            expect(event).toBe(QUIT_REQUESTED_EVENT);
            handler = cb;
            return () => {};
        });
        let finish: () => void = () => {};
        register(() => new Promise<void>((resolve) => (finish = resolve)));

        listenForQuit();
        await vi.waitFor(() => expect(listen).toHaveBeenCalled());
        handler();
        await Promise.resolve();
        expect(command).not.toHaveBeenCalled();

        finish();
        await vi.waitFor(() => expect(command).toHaveBeenCalledWith("quit_app"));
    });

    it("stops listening when stopped", async () => {
        const unlisten = vi.fn();
        listen.mockResolvedValue(unlisten);
        const stop = listenForQuit();
        stop();
        await vi.waitFor(() => expect(unlisten).toHaveBeenCalledOnce());
    });
});
