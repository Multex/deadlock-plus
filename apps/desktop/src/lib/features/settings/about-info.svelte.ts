import { getAppInfo } from "./api";
import type { AppInfo } from "@deadlock-plus/ipc-types/AppInfo";

class AboutInfoStore {
    info = $state<AppInfo | null>(null);
    status = $state<"loading" | "ready" | "error">("loading");

    async load() {
        try {
            this.info = await getAppInfo();
            this.status = "ready";
        } catch {
            this.info = null;
            this.status = "error";
        }
    }
}

export const aboutInfo = new AboutInfoStore();
