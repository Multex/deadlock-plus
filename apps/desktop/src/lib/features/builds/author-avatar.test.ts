import { beforeEach, describe, expect, it, vi } from "vitest";
import { deadlockApi } from "$lib/core/deadlock-api";
import { steamAccount } from "$lib/features/steam-account/account.svelte";

vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: { steamProfiles: vi.fn() } }));
vi.mock("$lib/features/steam-account/account.svelte", () => ({ steamAccount: { account: null } }));

const profiles = vi.mocked(deadlockApi.steamProfiles);
const ME = { steamId64: "76561198347512100", steamId32: 387246372, personaName: "me", userdataDir: null };

async function fresh() {
    vi.resetModules();
    return (await import("./author-avatar.svelte")).authorAvatar;
}

beforeEach(() => {
    profiles.mockReset();
    steamAccount.account = null;
});

describe("authorAvatar", () => {
    it("uses the signed-in account's own picture for its builds without asking deadlock-api", async () => {
        const authorAvatar = await fresh();
        steamAccount.account = { ...ME, avatarDataUrl: "data:image/jpeg;base64,me" };
        expect(authorAvatar(ME.steamId32)).toBe("data:image/jpeg;base64,me");
        expect(profiles).not.toHaveBeenCalled();
    });

    it("loads another author's Steam avatar from deadlock-api once", async () => {
        const authorAvatar = await fresh();
        profiles.mockResolvedValue([{ account_id: 42, personaname: "x", avatarmedium: "https://cdn/42.jpg" }]);
        expect(authorAvatar(42)).toBeNull();
        await vi.waitFor(() => expect(authorAvatar(42)).toBe("https://cdn/42.jpg"));
        authorAvatar(42);
        expect(profiles).toHaveBeenCalledTimes(1);
        expect(profiles).toHaveBeenCalledWith([42]);
    });

    it("stays null for an author deadlock-api does not know or cannot reach", async () => {
        const authorAvatar = await fresh();
        profiles.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("offline"));
        authorAvatar(7);
        authorAvatar(8);
        await vi.waitFor(() => expect(profiles).toHaveBeenCalledTimes(2));
        await Promise.resolve();
        expect(authorAvatar(7)).toBeNull();
        expect(authorAvatar(8)).toBeNull();
    });

    it("has no avatar for a build with no author", async () => {
        const authorAvatar = await fresh();
        expect(authorAvatar(0)).toBeNull();
        expect(profiles).not.toHaveBeenCalled();
    });
});
