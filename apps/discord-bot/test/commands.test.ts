import { describe, expect, it } from "vitest";
import { commands, staffCommand } from "../src/commands";

describe("staffCommand", () => {
    it("is hidden from members without Manage Server", () => {
        expect(staffCommand("probe", "Probe").toJSON().default_member_permissions).toBe("32");
    });

    it("works only inside a server", () => {
        expect(staffCommand("probe", "Probe").toJSON().contexts).toEqual([0]);
    });
});

describe("commands", () => {
    it("are all staff commands", () => {
        for (const command of commands) {
            expect(command.toJSON().default_member_permissions).toBe("32");
        }
    });
});
