import { describe, expect, it } from "vitest";
import { closeOutcome, confirmRunner } from "./confirm-dialog";

describe("closeOutcome", () => {
    it("does nothing while the dialog opens", () => {
        expect(closeOutcome(true, false)).toBe("none");
    });

    it("cancels a close that did not come from confirm", () => {
        expect(closeOutcome(false, false)).toBe("cancel");
    });

    it("does not cancel a close that followed confirm", () => {
        expect(closeOutcome(false, true)).toBe("none");
    });
});

describe("confirmRunner", () => {
    function setup() {
        const events: string[] = [];
        const runner = confirmRunner({
            close: () => events.push("close"),
            pending: (on) => events.push(on ? "busy" : "idle"),
        });
        return { events, runner };
    }

    function deferred() {
        let resolve!: () => void;
        let reject!: (reason: unknown) => void;
        const promise = new Promise<void>((yes, no) => {
            resolve = yes;
            reject = no;
        });
        return { promise, resolve, reject };
    }

    it("closes after a handler that returns nothing", async () => {
        const { events, runner } = setup();
        await runner.confirm(() => {});
        expect(events).toEqual(["busy", "idle", "close"]);
    });

    it("closes when there is no handler", async () => {
        const { events, runner } = setup();
        await runner.confirm(undefined);
        expect(events).toEqual(["busy", "idle", "close"]);
    });

    it("stays open and busy until the handler's promise resolves", async () => {
        const { events, runner } = setup();
        const work = deferred();
        const done = runner.confirm(() => work.promise);
        await Promise.resolve();
        expect(events).toEqual(["busy"]);

        work.resolve();
        await done;
        expect(events).toEqual(["busy", "idle", "close"]);
    });

    it("stays open and passes the error on when the handler rejects", async () => {
        const { events, runner } = setup();
        await expect(runner.confirm(() => Promise.reject(new Error("no")))).rejects.toThrow("no");
        expect(events).toEqual(["busy", "idle"]);
    });

    it("stays open and passes the error on when the handler throws", async () => {
        const { events, runner } = setup();
        await expect(
            runner.confirm(() => {
                throw new Error("no");
            }),
        ).rejects.toThrow("no");
        expect(events).toEqual(["busy", "idle"]);
    });

    it("leaves a dialog alone that was opened again while the handler ran", async () => {
        const { events, runner } = setup();
        const work = deferred();
        const done = runner.confirm(() => work.promise);
        runner.opened();
        expect(events).toEqual(["busy", "idle"]);

        work.resolve();
        await done;
        expect(events).toEqual(["busy", "idle"]);
    });

    it("ignores a second confirm while the first is running", async () => {
        const { events, runner } = setup();
        const work = deferred();
        let calls = 0;
        const handler = () => {
            calls += 1;
            return work.promise;
        };
        const first = runner.confirm(handler);
        const second = runner.confirm(handler);
        work.resolve();
        await Promise.all([first, second]);

        expect(calls).toBe(1);
        expect(events).toEqual(["busy", "idle", "close"]);
    });
});
