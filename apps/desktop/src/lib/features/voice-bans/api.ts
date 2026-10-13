import { command } from "$lib/core/tauri";

import type { VoiceBanFile } from "@deadlock-plus/ipc-types/VoiceBanFile";

export type { VoiceBanFile };

export function isGameRunning() {
    return command<boolean>("is_game_running");
}

export function readVoiceBan() {
    return command<VoiceBanFile>("read_voice_ban");
}

export function writeVoiceBan(text: string) {
    return command<string>("write_voice_ban", { text });
}
