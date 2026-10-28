import type { UpdateChannel } from "@deadlock-plus/ipc-types/UpdateChannel";

export type { UpdateChannel };

export const UPDATE_CHANNELS = ["release", "beta", "nightly"] as const satisfies readonly UpdateChannel[];

export const DEFAULT_UPDATE_CHANNEL: UpdateChannel = "release";

export function resolveUpdateChannel(raw: unknown): UpdateChannel {
    return UPDATE_CHANNELS.find((channel) => channel === raw) ?? DEFAULT_UPDATE_CHANNEL;
}
