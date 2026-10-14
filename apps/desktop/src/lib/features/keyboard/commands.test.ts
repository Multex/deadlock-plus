import { describe, expect, it } from "vitest";
import { buildCommands, type CommandDeps } from "./commands";

function deps(overrides: Partial<CommandDeps> = {}): CommandDeps & { went: string[]; ran: string[] } {
    const went: string[] = [];
    const ran: string[] = [];
    return {
        pages: [
            { id: "home", label: "Home", href: "/" },
            { id: "stats", label: "Stats", href: "/stats" },
            { id: "alerts", label: "Updates", href: "/alerts" },
        ],
        settingsSections: [
            { id: "appearance", label: "Appearance" },
            { id: "about", label: "Version" },
        ],
        platform: "windows",
        go: (href) => went.push(href),
        checkForUpdates: () => ran.push("update"),
        openSupport: () => ran.push("support"),
        went,
        ran,
        ...overrides,
    };
}

describe("buildCommands", () => {
    it("adds a page command per nav entry that navigates to its href", () => {
        const d = deps();
        const stats = buildCommands(d).find((c) => c.id === "page:stats");
        expect(stats?.group).toBe("pages");
        stats?.run();
        expect(d.went).toEqual(["/stats"]);
    });

    it("shows the jump shortcut on the first nine pages in order", () => {
        const pages = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, label: `Page ${i}`, href: `/p${i}` }));
        const commands = buildCommands(deps({ pages })).filter((c) => c.group === "pages");
        expect(commands[0].shortcut).toBe("Ctrl+1");
        expect(commands[8].shortcut).toBe("Ctrl+9");
        expect(commands[9].shortcut).toBeUndefined();
    });

    it("uses Cmd for the shortcuts on macOS", () => {
        const commands = buildCommands(deps({ platform: "macos" }));
        expect(commands.find((c) => c.id === "page:home")?.shortcut).toBe("Cmd+1");
    });

    it("adds a command for every settings section", () => {
        const d = deps();
        const about = buildCommands(d).find((c) => c.id === "settings:about");
        expect(about?.group).toBe("settings");
        about?.run();
        expect(d.went).toEqual(["/settings/about"]);
    });

    it("opens settings, checks for updates and opens support", () => {
        const d = deps();
        const commands = buildCommands(d);
        commands.find((c) => c.id === "action:settings")?.run();
        commands.find((c) => c.id === "action:check-updates")?.run();
        commands.find((c) => c.id === "action:support")?.run();
        expect(d.went).toEqual(["/settings"]);
        expect(d.ran).toEqual(["update", "support"]);
    });

    it("lists every shortcut in the shortcuts group", () => {
        const labels = buildCommands(deps())
            .filter((c) => c.group === "shortcuts")
            .map((c) => `${c.label} ${c.shortcut}`);
        expect(labels).toEqual(["Quick search Ctrl+K", "Jump to a page Ctrl+1-9"]);
    });

    it("has unique ids", () => {
        const ids = buildCommands(deps()).map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
