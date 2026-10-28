import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";

const { answers } = vi.hoisted(() => ({ answers: new Map<string, () => unknown>() }));
vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async (name: string) => answers.get(name)?.()),
    fileSrc: (path: string) => path,
    listen: vi.fn(async () => () => {}),
}));

import { t } from "$lib/core/i18n.svelte";
import { aboutInfo } from "$lib/features/settings/about-info.svelte";
import VersionCard from "./version-card.svelte";

const INFO = { appVersion: "1.2.3", gameBuild: null, elevated: false };

describe("about version card", () => {
    beforeEach(() => {
        answers.clear();
        answers.set("app_info", () => INFO);
    });

    it("shows the version block when app_info answers", async () => {
        await aboutInfo.load();
        const body = render(VersionCard).body;
        expect(body).toContain("1.2.3");
        expect(body).not.toContain('data-region-state="error"');
    });

    it("keeps the block and shows a calm error with Retry when app_info throws", async () => {
        answers.set("app_info", () => {
            throw { code: "common.internal" };
        });
        await aboutInfo.load();
        const body = render(VersionCard).body;
        expect(body).toContain('data-region="about-version"');
        expect(body).toContain('data-region-state="error"');
        expect(body).toContain(t("settings.about_page.version_error"));
        expect(body).toContain("Retry");
    });

    it("shows the error when app_info answers null", async () => {
        answers.set("app_info", () => null);
        await aboutInfo.load();
        expect(render(VersionCard).body).toContain('data-region-state="error"');
    });

    it("recovers on a second load", async () => {
        answers.set("app_info", () => null);
        await aboutInfo.load();
        answers.set("app_info", () => INFO);
        await aboutInfo.load();
        const body = render(VersionCard).body;
        expect(body).toContain("1.2.3");
        expect(body).not.toContain('data-region-state="error"');
    });
});
