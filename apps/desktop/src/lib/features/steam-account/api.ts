import { command } from "$lib/core/tauri";
import type { SteamAccount } from "@deadlock-plus/ipc-types/SteamAccount";

export function currentSteamAccount() {
    return command<SteamAccount | null>("current_steam_account");
}
