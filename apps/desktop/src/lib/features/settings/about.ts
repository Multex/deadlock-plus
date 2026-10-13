import type { GameBuild } from "@deadlock-plus/ipc-types/GameBuild";
import type { AppInfo } from "@deadlock-plus/ipc-types/AppInfo";
import { platform as currentPlatform, type Platform } from "$lib/core/platform";
import { t } from "$lib/core/i18n.svelte";

export { getAppInfo } from "./api";
export type { GameBuild, AppInfo };

export interface AboutGroup {
    title: string;
    rows: [label: string, value: string][];
}

function present(rows: [string, string | null | undefined][]): [string, string][] {
    return rows.filter((r): r is [string, string] => !!r[1]);
}

const WEBVIEW_LABEL: Record<Platform, string> = { windows: "WebView2", macos: "WKWebView", linux: "WebKitGTK" };

function accountLabel(elevated: boolean, p: Platform): string {
    if (p === "windows") return elevated ? t("about.administrator") : t("about.standard_user");
    return elevated ? t("about.root") : t("about.regular_user");
}

export function aboutGroups(info: AppInfo, p: Platform = currentPlatform): AboutGroup[] {
    const build = info.gameBuild;
    const built = [build?.versionDate, build?.versionTime].filter(Boolean).join(" ");
    const groups: AboutGroup[] = [
        {
            title: "Deadlock+",
            rows: present([
                [
                    t("about.version"),
                    info.debugBuild ? t("about.dev_build", { version: info.appVersion }) : info.appVersion,
                ],
                [t("about.running_as"), accountLabel(info.elevated, p)],
                [t("about.system"), `${info.os} (${info.arch})`],
                ["Tauri", info.tauriVersion],
                [WEBVIEW_LABEL[p], info.webviewVersion],
                [t("about.data_folder"), info.dataDir],
            ]),
        },
        {
            title: "Deadlock",
            rows: present([
                [t("about.game_build"), build?.clientVersion],
                [t("about.game_built"), built],
                [t("about.source_revision"), build?.sourceRevision],
                [t("about.install_folder"), info.gameDir],
            ]),
        },
    ];
    return groups.filter((g) => g.rows.length > 0);
}

export function aboutText(info: AppInfo, p: Platform = currentPlatform): string {
    return aboutGroups(info, p)
        .map((g) => [g.title, ...g.rows.map(([k, v]) => `${k}: ${v}`)].join("\n"))
        .join("\n\n");
}
