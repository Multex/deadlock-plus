import type { Announcement } from "@deadlock-plus/ipc-types/Announcement";
import type { Scenario } from "../../scenario";
import { defaultScenario, type ScenarioOptions } from "../default";

const ITEMS: Record<Announcement["severity"], Announcement> = {
    info: {
        id: "demo-website-themes",
        title: "Every theme is on the website now",
        body: "Try any Deadlock+ theme in your browser before you pick one in the app.",
        severity: "info",
        link: { url: "https://deadlockplus.app", label: "Open the website" },
    },
    warning: {
        id: "demo-api-slow",
        title: "New matches may show up late today",
        body: "The Deadlock API is running slow, so match history can lag a few hours.\nNothing is lost: every match fills in once it catches up.",
        severity: "warning",
        link: null,
    },
    critical: {
        id: "demo-manual-update",
        title: "Deadlock+ 0.13.0 cannot update itself",
        body: "This version cannot install updates on its own.\nDownload the newest release from GitHub and run the installer once.",
        severity: "critical",
        link: { url: "https://github.com/deadlock-plus/deadlock-plus/releases/latest", label: "Get the update" },
    },
};

/** The default scenario with one announcement of `severity` in the feed. */
function announcementScenario(severity: Announcement["severity"], options: ScenarioOptions): Scenario {
    const scenario = defaultScenario(options).with({ handlers: { get_announcements: () => [ITEMS[severity]] } });
    return { ...scenario, id: `announcements-${severity}` };
}

export const ANNOUNCEMENT_SCENARIOS: Record<string, (options: ScenarioOptions) => Scenario> = {
    "announcements-info": (options) => announcementScenario("info", options),
    "announcements-warning": (options) => announcementScenario("warning", options),
    "announcements-critical": (options) => announcementScenario("critical", options),
};
