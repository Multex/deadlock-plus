import { command } from "$lib/core/tauri";

import type { VoiceBanFile } from "@deadlock-plus/ipc-types/VoiceBanFile";

export type { VoiceBanFile };

export function isGameRunning() {
    return command<boolean>("is_game_running");
}

const isVoiceBanFile = (value: unknown): value is VoiceBanFile => {
    if (typeof value !== "object" || value === null) return false;
    const { path, exists, text, gameRunning } = value as Record<string, unknown>;
    return (
        typeof path === "string" &&
        typeof exists === "boolean" &&
        typeof text === "string" &&
        typeof gameRunning === "boolean"
    );
};

export async function readVoiceBan() {
    const value = await command<unknown>("read_voice_ban");
    if (!isVoiceBanFile(value)) throw new Error("read_voice_ban answered an unexpected shape");
    return value;
}

export function writeVoiceBan(text: string) {
    return command<string>("write_voice_ban", { text });
}
