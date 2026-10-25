import { describe, expect, it } from "vitest";
import { waitForPhoto, type PhotoWaitDeps } from "./photo-wait";

function deferred() {
    let resolve!: () => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function setup() {
    const decode = deferred();
    const timer = deferred();
    const log: string[] = [];
    const deps: PhotoWaitDeps = {
        decode: (src) => {
            log.push(`decode ${src}`);
            return decode.promise;
        },
        timeout: (ms) => {
            log.push(`timeout ${ms}`);
            return timer.promise;
        },
    };
    return { decode, timer, log, deps };
}

async function settled<T>(p: Promise<T>): Promise<T | "pending"> {
    let value: T | "pending" = "pending";
    void p.then((v) => (value = v));
    await new Promise((r) => setTimeout(r, 0));
    return value;
}

describe("waitForPhoto", () => {
    it("holds the toss until the photo has decoded", async () => {
        const { decode, log, deps } = setup();
        const wait = waitForPhoto("hero.webp", deps, 1500);
        expect(await settled(wait)).toBe("pending");
        expect(log).toEqual(["decode hero.webp", "timeout 1500"]);
        decode.resolve();
        expect(await settled(wait)).toBe("ready");
    });

    it("lets the toss go when the photo is slower than the cap", async () => {
        const { timer, deps } = setup();
        const wait = waitForPhoto("hero.webp", deps, 1500);
        timer.resolve();
        expect(await settled(wait)).toBe("timeout");
    });

    it("lets the toss go when the photo fails to load", async () => {
        const { decode, deps } = setup();
        const wait = waitForPhoto("hero.webp", deps, 1500);
        decode.reject(new Error("broken"));
        expect(await settled(wait)).toBe("failed");
    });

    it("does not wait when there is no photo", async () => {
        const { log, deps } = setup();
        expect(await settled(waitForPhoto(null, deps, 1500))).toBe("none");
        expect(log).toEqual([]);
    });
});
