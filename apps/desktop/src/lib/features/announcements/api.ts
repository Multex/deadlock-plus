import type { Announcement } from "@deadlock-plus/ipc-types/Announcement";
import { command } from "$lib/core/tauri";

export const getAnnouncements = () => command<Announcement[]>("get_announcements");
