import { describe, expect, it } from "vitest";
import { CalendarClock, Coffee, Megaphone, Server } from "@lucide/svelte";

import { kindIcon } from "./kind-icon";

describe("kind icon", () => {
    it.each([
        ["maintenance", CalendarClock],
        ["servers", Server],
        ["session", Coffee],
        ["alert", Megaphone],
    ] as const)("draws %s with its own icon", (kind, icon) => {
        expect(kindIcon(kind)).toBe(icon);
    });
});
