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

interface Option {
    name: string;
    description: string;
    required?: boolean;
    options?: Option[];
}

function walk(options: Option[] | undefined, visit: (option: Option, siblings: Option[]) => void): void {
    for (const option of options ?? []) {
        visit(option, options as Option[]);
        walk(option.options, visit);
    }
}

describe("commands", () => {
    it("are all staff commands", () => {
        for (const command of commands) {
            expect(command.toJSON().default_member_permissions).toBe("32");
        }
    });

    // Discord refuses the whole registration when either rule below is broken.
    it("keep every description within 100 characters", () => {
        for (const command of commands) {
            const json = command.toJSON() as Option;
            expect(json.description.length).toBeLessThanOrEqual(100);
            walk(json.options, (option) => expect(option.description.length, option.name).toBeLessThanOrEqual(100));
        }
    });

    it("list required options before optional ones", () => {
        for (const command of commands) {
            walk((command.toJSON() as Option).options, (_, siblings) => {
                const required = siblings.map((option) => !!option.required);
                expect(required).toEqual([...required].sort((a, b) => Number(b) - Number(a)));
            });
        }
    });
});
