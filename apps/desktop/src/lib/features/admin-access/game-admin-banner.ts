import type { AdminAccessStatus } from "@deadlock-plus/ipc-types/AdminAccessStatus";

export function showGameAdminBanner(status: AdminAccessStatus | null, pathname: string): boolean {
    if (!status?.gameRunsAsAdmin) return false;
    return !(pathname === "/live" || pathname.startsWith("/live/"));
}
