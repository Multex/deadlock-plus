import type { Delivery } from "@deadlock-plus/ipc-types/Delivery";
import type { NotificationSettings } from "@deadlock-plus/ipc-types/NotificationSettings";
import type { NotificationTopic } from "@deadlock-plus/ipc-types/NotificationTopic";

export type { Delivery, NotificationSettings, NotificationTopic };

export type Deliveries = Record<NotificationTopic, Delivery>;

const DEFAULT_DELIVERIES: Deliveries = {
    updates: "both",
    maintenance: "both",
    serverBlocksUpdated: "quiet",
    serverBlocksStale: "both",
    breakReminder: "both",
    matchFound: "overlay",
};

export const DEFAULT_NOTIFICATIONS: NotificationSettings & { deliveries: Deliveries } = {
    deliveries: DEFAULT_DELIVERIES,
    serverBlocksUpdated: true,
    serverBlocksStale: true,
};

export const DELIVERIES: readonly Delivery[] = ["both", "overlay", "os", "quiet", "center"];

const TOPICS = Object.keys(DEFAULT_DELIVERIES) as NotificationTopic[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const isDelivery = (value: unknown): value is Delivery => DELIVERIES.includes(value as Delivery);

function deliveries(stored: unknown): Deliveries {
    const source = isRecord(stored) ? stored : {};
    return Object.fromEntries(
        TOPICS.map((topic) => [topic, isDelivery(source[topic]) ? source[topic] : DEFAULT_DELIVERIES[topic]]),
    ) as Deliveries;
}

export function resolveNotifications(stored: unknown): NotificationSettings & { deliveries: Deliveries } {
    const source = isRecord(stored) ? stored : {};
    const flag = (key: "serverBlocksUpdated" | "serverBlocksStale") =>
        typeof source[key] === "boolean" ? source[key] : DEFAULT_NOTIFICATIONS[key];
    return {
        deliveries: deliveries(source.deliveries),
        serverBlocksUpdated: flag("serverBlocksUpdated"),
        serverBlocksStale: flag("serverBlocksStale"),
    };
}
