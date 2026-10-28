import type { Announcement } from "@deadlock-plus/ipc-types/Announcement";
import { afterEach, describe, expect, it } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { defaultScenario } from "../default";
import { ANNOUNCEMENT_SCENARIOS } from "./index";

const OPTIONS = { appVersion: "1.2.3", changelog: "# Changelog\n", mapItemsTsv: "" };

let handle: DemoHandle | undefined;
afterEach(() => handle?.uninstall());

const announcements = () => handle!.invoke("get_announcements", {}) as Announcement[];

describe("announcement scenarios", () => {
    it("the default scenario has no announcements", () => {
        handle = install(defaultScenario(OPTIONS));
        expect(announcements()).toEqual([]);
    });

    it.each(["info", "warning", "critical"] as const)("announcements-%s answers one %s item", (severity) => {
        const id = `announcements-${severity}`;
        const scenario = ANNOUNCEMENT_SCENARIOS[id]!(OPTIONS);
        expect(scenario.id).toBe(id);
        handle = install(scenario);
        const items = announcements();
        expect(items.map((a) => a.severity)).toEqual([severity]);
        for (const item of items) {
            expect(item.id).toMatch(/^[a-z0-9-]{1,64}$/);
            expect(item.title.length).toBeLessThanOrEqual(80);
            expect(item.body.length).toBeLessThanOrEqual(600);
            expect(`${item.title} ${item.body} ${item.link?.label ?? ""}`).not.toMatch(/[–—]/);
        }
        expect(handle.unhandled()).toEqual([]);
    });
});
