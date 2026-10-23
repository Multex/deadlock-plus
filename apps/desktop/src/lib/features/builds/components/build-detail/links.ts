import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { LocalBuild } from "@deadlock-plus/ipc-types/LocalBuild";
import { LOCAL_ID_LIMIT } from "../../my-builds";

/** The build's public id, or null for a draft or a build that was never published. */
export function buildlockerBuildId(detail: {
    draft: unknown;
    local: Pick<LocalBuild, "section"> | null;
    build: Pick<BuildView, "heroBuildId"> | null;
}): number | null {
    const id = detail.build?.heroBuildId;
    if (detail.draft || id === undefined || id < LOCAL_ID_LIMIT) return null;
    return detail.local?.section === "Unpublished" ? null : id;
}
