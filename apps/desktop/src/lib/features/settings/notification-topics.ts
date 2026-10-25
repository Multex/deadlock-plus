import type { Delivery } from "@deadlock-plus/ipc-types/Delivery";
import type { NotificationSettings } from "@deadlock-plus/ipc-types/NotificationSettings";
import type { NotificationTopic } from "@deadlock-plus/ipc-types/NotificationTopic";
import { platform, type Platform } from "$lib/core/platform";
import { hasOverlay } from "./catalog";

export type { Delivery, NotificationSettings, NotificationTopic };

export type Deliveries = Record<NotificationTopic, Delivery>;

const DEFAULT_DELIVERIES: Deliveries = {
    updates: "both",
    maintenance: "both",
    serverBlocksUpdated: "quiet",
    serverBlocksStale: "both",
    breakReminder: "both",
    matchFound: "overlay",
    queueStopped: "overlay",
    frontPageWaiting: "overlay",
};

export const DEFAULT_NOTIFICATIONS: NotificationSettings & { deliveries: Deliveries } = {
    deliveries: DEFAULT_DELIVERIES,
    serverBlocksUpdated: true,
    serverBlocksStale: true,
};

const ALL_DELIVERIES: readonly Delivery[] = ["both", "overlay", "os", "quiet", "center"];

export function deliveriesFor(p: Platform): readonly Delivery[] {
    return hasOverlay(p) ? ALL_DELIVERIES : ALL_DELIVERIES.filter((d) => d !== "overlay");
}

/** The "Shows as" choices on this platform, in menu order. */
export const DELIVERIES: readonly Delivery[] = deliveriesFor(platform);

const TOPICS = Object.keys(DEFAULT_DELIVERIES) as NotificationTopic[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const isDelivery = (value: unknown): value is Delivery => ALL_DELIVERIES.includes(value as Delivery);

function deliveries(stored: unknown): Deliveries {
    const source = isRecord(stored) ? stored : {};
    return Object.fromEntries(
        TOPICS.map((topic) => [topic, isDelivery(source[topic]) ? source[topic] : DEFAULT_DELIVERIES[topic]]),
    ) as Deliveries;
}

/** Match found, queue stopped and front page waiting show in the game overlay only, never as a desktop toast or a center entry. Every other topic
 *  set to the overlay falls back to a desktop toast where there is no overlay. */
function fixed(deliveries: Deliveries, p: Platform): Deliveries {
    const shown = (delivery: Delivery): Delivery => (delivery === "overlay" && !hasOverlay(p) ? "os" : delivery);
    const each = Object.fromEntries(TOPICS.map((topic) => [topic, shown(deliveries[topic])])) as Deliveries;
    return { ...each, matchFound: "overlay", queueStopped: "overlay", frontPageWaiting: "overlay" };
}

export function resolveNotifications(
    stored: unknown,
    p: Platform = platform,
): NotificationSettings & { deliveries: Deliveries } {
    const source = isRecord(stored) ? stored : {};
    const flag = (key: "serverBlocksUpdated" | "serverBlocksStale") =>
        typeof source[key] === "boolean" ? source[key] : DEFAULT_NOTIFICATIONS[key];
    return {
        deliveries: fixed(deliveries(source.deliveries), p),
        serverBlocksUpdated: flag("serverBlocksUpdated"),
        serverBlocksStale: flag("serverBlocksStale"),
    };
}
