import type { Component } from "svelte";
import { CalendarClock, Coffee, Megaphone, Server, Swords } from "@lucide/svelte";
import type { NotificationKind } from "@deadlock-plus/ipc-types/NotificationKind";

export function kindIcon(kind: NotificationKind): Component {
    switch (kind) {
        case "maintenance":
            return CalendarClock;
        case "servers":
            return Server;
        case "session":
            return Coffee;
        case "match":
            return Swords;
        default:
            return Megaphone;
    }
}
