import { command } from "$lib/core/tauri";

/** Shows the "front page waiting" alert in the game overlay; nothing shows where there is no overlay. */
export const notifyFrontPageWaiting = () => command("notify_front_page_waiting");
