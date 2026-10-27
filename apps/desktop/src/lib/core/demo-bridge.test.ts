import { isMissingArtUrl, type Fault } from "@deadlock-plus/demo";
import { afterEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({ ipc: undefined as ((command: string, args: unknown) => unknown) | undefined }));

vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn() }));
vi.mock("@tauri-apps/api/mocks", () => ({
    mockWindows: vi.fn(),
    mockConvertFileSrc: vi.fn(() => {
        (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
            convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
        };
    }),
    mockIPC: vi.fn((handler: (command: string, args: unknown) => unknown) => {
        tauri.ipc = handler;
    }),
}));

const { startDemo } = await import("./demo-bridge");

type Page = Window & { __TAURI_INTERNALS__: { convertFileSrc(path: string): string } };

function load(search: string, faults?: Fault[]): Page {
    const page = {
        location: { search },
        __DEADLOCK_PLUS_DEMO__: faults ? { faults } : undefined,
    } as unknown as Page;
    vi.stubGlobal("window", page);
    startDemo("1");
    return page;
}

describe("demo bridge faults", () => {
    afterEach(() => {
        window.__DEADLOCK_PLUS_DEMO__?.handle?.uninstall();
        vi.unstubAllGlobals();
    });

    it("starts with the faults named in the fault query", () => {
        const page = load("?fault=command:gc_status:throw,api:/v1/players:503");
        expect(page.__DEADLOCK_PLUS_DEMO__!.handle!.faults()).toEqual([
            { command: "gc_status", mode: "throw" },
            { api: "/v1/players", mode: "503" },
        ]);
        expect(() => tauri.ipc!("gc_status", {})).toThrow(expect.objectContaining({ code: "common.internal" }));
    });

    it("takes the faults a test set on the page over the query", () => {
        const page = load("?fault=api::503", [{ command: "gc_status", mode: "null" }]);
        expect(page.__DEADLOCK_PLUS_DEMO__!.handle!.faults()).toEqual([{ command: "gc_status", mode: "null" }]);
        expect(tauri.ipc!("gc_status", {})).toBeNull();
    });

    it("turns local art paths into missing images while art is missing, and back once faults clear", () => {
        const page = load("?fault=art:missing");
        const convert = page.__TAURI_INTERNALS__.convertFileSrc;
        expect(isMissingArtUrl(convert("C:/Game/hero.png"))).toBe(true);
        expect(isMissingArtUrl(convert("https://assets.example/hero.webp"))).toBe(true);

        page.__DEADLOCK_PLUS_DEMO__!.handle!.clearFaults();
        expect(convert("C:/Game/hero.png")).toBe("http://asset.localhost/C%3A%2FGame%2Fhero.png");
        expect(convert("https://assets.example/hero.webp")).toBe("https://assets.example/hero.webp");
    });

    it("runs without faults when none are named", () => {
        const page = load("");
        expect(page.__DEADLOCK_PLUS_DEMO__!.handle!.faults()).toEqual([]);
    });
});
