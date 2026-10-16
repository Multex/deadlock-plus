import { emit } from "@tauri-apps/api/event";
import { listen, type Unlisten } from "$lib/core/tauri";
import type { OverlayPosition } from "@deadlock-plus/ipc-types/OverlayPosition";
import type { OverlayToast } from "@deadlock-plus/ipc-types/OverlayToast";

export const OVERLAY_WINDOW = "overlay";

const TOAST_EVENT = "overlay://toast";
const READY_EVENT = "overlay-ready";
const POSITION_EVENT = "overlay://position";

export const onOverlayToast = (handler: (toast: OverlayToast) => void): Promise<Unlisten> =>
    listen<OverlayToast>(TOAST_EVENT, handler);

export const onOverlayPosition = (handler: (position: OverlayPosition) => void): Promise<Unlisten> =>
    listen<OverlayPosition>(POSITION_EVENT, handler);

export const announceReady = (): Promise<void> => emit(READY_EVENT);
