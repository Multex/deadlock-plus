import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Update } from "@tauri-apps/plugin-updater";
import { describe, expect, it } from "vitest";

// The updater tests mock the plugin, so a command the ACL rejects only fails in a real build.
const TAURI_DIR = fileURLToPath(new URL("../../../../src-tauri/", import.meta.url));

interface Capability {
    windows?: string[];
    webviews?: string[];
    permissions: (string | { identifier: string })[];
}

function grantedTo(window: string): Set<string> {
    const dir = join(TAURI_DIR, "capabilities");
    const granted = new Set<string>();
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
        const capability = JSON.parse(readFileSync(join(dir, file), "utf8")) as Capability;
        if (!capability.windows?.includes(window)) continue;
        for (const permission of capability.permissions) {
            granted.add(typeof permission === "string" ? permission : permission.identifier);
        }
    }
    return granted;
}

/** The plugin commands a method of the plugin's own `Update` class invokes, read from the code the app ships. */
function pluginCommands(method: (...args: never[]) => unknown): string[] {
    return [...method.toString().matchAll(/["']plugin:updater\|(\w+)["']/g)].map(([, name]) => name);
}

describe("updater capability", () => {
    // The update flow downloads, then installs as a separate step, both through the plugin's `Update` object.
    const used = [...pluginCommands(Update.prototype.download), ...pluginCommands(Update.prototype.install)];

    it("reads the plugin commands the update flow invokes", () => {
        expect(used).toEqual(["download", "install"]);
    });

    it.each(used)("lets the main window run the plugin's %s command", (command) => {
        expect(grantedTo("main")).toContain(`updater:allow-${command.replaceAll("_", "-")}`);
    });

    it("lets the main window use the progress channel and the update's resource", () => {
        expect(grantedTo("main")).toContain("core:default");
    });

    // App commands such as `check_update` need no permission until the app declares its own ACL manifest; from then
    // on each one must be granted, or the check fails in release builds only.
    it("keeps check_update reachable from the main window", () => {
        const build = readFileSync(join(TAURI_DIR, "build.rs"), "utf8");
        if (!/AppManifest/.test(build)) return;
        expect(grantedTo("main")).toContain("allow-check-update");
    });
});
