import { describe, expect, it, vi } from "vitest";

const environment = vi.hoisted(() => ({ dev: false }));
vi.mock("$app/environment", () => environment);

import { load } from "./+page.server";

describe("the link preview page", () => {
    it("does not exist on the deployed site", () => {
        environment.dev = false;
        expect(() => load()).toThrow(expect.objectContaining({ status: 404 }));
    });

    it("is served by the dev server, where the capture script reads it", () => {
        environment.dev = true;
        expect(() => load()).not.toThrow();
    });
});
