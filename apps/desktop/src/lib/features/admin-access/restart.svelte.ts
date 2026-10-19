import { t } from "$lib/core/i18n.svelte";
import { restartAsAdmin } from "./api";

export class RestartAsAdmin {
    /** True from a launched restart until the app quits. */
    pending = $state(false);
    error = $state<string | null>(null);

    constructor(private readonly call: () => Promise<"launched" | "cancelled"> = restartAsAdmin) {}

    async run() {
        if (this.pending) return;
        this.pending = true;
        this.error = null;
        try {
            if ((await this.call()) === "cancelled") this.pending = false;
        } catch {
            this.pending = false;
            this.error = t("admin_access.game_admin.restart_failed");
        }
    }
}

export const restartAsAdminAction = new RestartAsAdmin();
