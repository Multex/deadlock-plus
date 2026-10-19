import { command, listen } from "./tauri";

/** Sent by the backend for the tray's Quit and for closing the main window with close to tray off. */
export const QUIT_REQUESTED_EVENT = "quit-requested";

const tasks = new Set<() => unknown>();

/** Runs `task` before the app quits or hands over to the update installer. Returns its remover. */
export function onBeforeExit(task: () => unknown): () => void {
    tasks.add(task);
    return () => tasks.delete(task);
}

export async function runBeforeExit(): Promise<void> {
    await Promise.allSettled([...tasks].map(async (task) => task()));
}

/** The backend exits on its own after a short grace period, so a page that never answers cannot block a quit. */
export function listenForQuit(): () => void {
    const unlisten = listen(QUIT_REQUESTED_EVENT, () => {
        void runBeforeExit()
            .then(() => command("quit_app"))
            .catch((e) => console.error("quit_app failed:", e));
    }).catch(() => () => {});
    return () => void unlisten.then((fn) => fn());
}
