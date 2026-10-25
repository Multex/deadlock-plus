import { prefs } from "$lib/core/prefs";
import { LEVELS, type LogLevel } from "$lib/features/logging/logs";

const DEFAULT_LEVEL: LogLevel = "INFO";

export function loadLogViewPrefs(): { level: LogLevel; autoScroll: boolean } {
    const stored = prefs.getString("logMinLevel", DEFAULT_LEVEL);
    return {
        level: LEVELS.find((l) => l === stored) ?? DEFAULT_LEVEL,
        autoScroll: prefs.getBool("logAutoScroll", true),
    };
}

export function saveLogMinLevel(level: LogLevel): void {
    prefs.setString("logMinLevel", level);
}

export function saveLogAutoScroll(on: boolean): void {
    prefs.setBool("logAutoScroll", on);
}
