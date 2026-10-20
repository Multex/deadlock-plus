import { describe, expect, it } from "vitest";
import capability from "../../../../src-tauri/capabilities/default.json";

// The updater tests mock the plugin, so a command the ACL rejects only fails in a real build.
describe("updater capability", () => {
    it.each(["check", "download", "install"])("allows the %s command the updater calls", (command) => {
        expect(capability.permissions).toContain(`updater:allow-${command}`);
    });
});
