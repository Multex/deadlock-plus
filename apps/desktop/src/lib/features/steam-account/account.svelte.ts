import { currentSteamAccount } from "./api";
import type { SteamAccount } from "@deadlock-plus/ipc-types/SteamAccount";

export type { SteamAccount };

class SteamAccountStore {
    account = $state<SteamAccount | null>(null);
    loaded = $state(false);

    async refresh() {
        try {
            this.account = await currentSteamAccount();
        } catch {
            // Not running inside Tauri.
        }
        this.loaded = true;
    }

    start() {
        void this.refresh();
        const onFocus = () => void this.refresh();
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }
}

export const steamAccount = new SteamAccountStore();
