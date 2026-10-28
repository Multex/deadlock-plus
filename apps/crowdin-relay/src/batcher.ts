import type { Message } from "@deadlock-plus/discord-messages";
import { type CrowdinSummary, type Tally, crowdinSummary, tallyLine } from "@deadlock-plus/discord-messages/crowdin";
import { send, webhookTarget } from "./discord";
import { editorLink, first, obj, person, render } from "./render";

export const QUIET_MS = 3 * 60_000;
export const MAX_WINDOW_MS = 15 * 60_000;
export const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 10 * 60_000;
/** Names past this many still count towards the tally, they are just not listed. */
const MAX_NAMES = 50;

/** The subset of `DurableObjectStorage` the batcher uses. */
export interface Storage {
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<boolean>;
    list<T>(options: { prefix: string }): Promise<Map<string, T>>;
    getAlarm(): Promise<number | null>;
    setAlarm(time: number): Promise<void>;
    deleteAlarm(): Promise<void>;
}

type Group = "translations" | "sources";

interface Bucket {
    group: Group;
    firstAt: number;
    lastAt: number;
    project?: string;
    language?: { id?: string; name?: string };
    link?: string;
    tallies: Record<string, { count: number; names: string[] }>;
}

interface Outgoing {
    message: Message;
    /** What the message is about, for logs. Never holds the webhook url. */
    label: string;
    dueAt: number;
    attempts: number;
    parked?: boolean;
}

interface Grouped {
    key: string;
    group: Group;
    action: string;
    actor?: string;
    project?: string;
    language?: { id?: string; name?: string };
    link?: string;
}

const ACTIONS: Record<Group, Record<string, string>> = {
    translations: {
        added: "translated",
        updated: "edited",
        approved: "approved",
        disapproved: "unapproved",
        deleted: "deleted",
    },
    sources: { added: "added", updated: "updated", deleted: "deleted" },
};

const BUCKET = "bucket:";
const OUT = "out:";
// Kept apart: the alarm writes NOT_BEFORE while a Discord request is in flight, and a webhook arriving
// meanwhile writes SEQ. One shared record would let either overwrite the other with a stale copy.
const SEQ = "seq";
const NOT_BEFORE = "notBefore";

function action(group: Group, event: string): string {
    const verb = event.slice(event.indexOf(".") + 1);
    return ACTIONS[group][verb] ?? verb.toLowerCase();
}

/** Per-string events are batched; file, project and every other event posts on its own. */
function classify(payload: unknown): Grouped | undefined {
    const event = obj(payload);
    const name = first(event?.event);
    if (!event || !name) return undefined;

    const translation = obj(event.translation);
    if (translation && (name.startsWith("suggestion.") || name.startsWith("translation."))) {
        const string = obj(translation.string);
        const project = obj(string?.project);
        const lang = obj(translation.targetLanguage);
        const languageId = first(lang?.id, lang?.locale, lang?.editorCode);
        return {
            key: `translations:${first(project?.id, project?.identifier) ?? ""}:${languageId ?? ""}`,
            group: "translations",
            action: action("translations", name),
            actor: person(obj(event.user)) ?? person(obj(translation.user)),
            project: first(project?.name),
            language: { id: languageId, name: first(lang?.name) },
            link: editorLink(project, lang),
        };
    }

    const source = obj(event.string);
    if (source && name.startsWith("string.")) {
        const project = obj(source.project);
        return {
            key: `sources:${first(project?.id, project?.identifier) ?? ""}`,
            group: "sources",
            action: action("sources", name),
            actor: person(obj(event.user)),
            project: first(project?.name),
            link: first(project?.url),
        };
    }
    return undefined;
}

function merge(bucket: Bucket | undefined, item: Grouped, now: number): Bucket {
    const next: Bucket = bucket ?? {
        group: item.group,
        firstAt: now,
        lastAt: now,
        project: item.project,
        language: item.language,
        link: item.link,
        tallies: {},
    };
    next.lastAt = now;
    next.project ??= item.project;
    next.link ??= item.link;
    const tally = (next.tallies[item.action] ??= { count: 0, names: [] });
    tally.count += 1;
    if (item.actor && !tally.names.includes(item.actor) && tally.names.length < MAX_NAMES) tally.names.push(item.actor);
    return next;
}

function dueAt(bucket: Bucket): number {
    return Math.min(bucket.lastAt + QUIET_MS, bucket.firstAt + MAX_WINDOW_MS);
}

function summary(bucket: Bucket): CrowdinSummary {
    const order = Object.values(ACTIONS[bucket.group]);
    const rank = (name: string) => (order.includes(name) ? order.indexOf(name) : order.length);
    const tallies: Tally[] = Object.entries(bucket.tallies)
        .map(([name, tally]) => ({ action: name, count: tally.count, names: tally.names }))
        .sort((a, b) => rank(a.action) - rank(b.action));

    if (bucket.group === "sources") {
        return {
            title: "Source strings",
            tallies,
            project: bucket.project,
            link: bucket.link ? { label: "Open project", url: bucket.link } : undefined,
        };
    }
    const language = bucket.language?.name;
    return {
        title: language ? `${language} translations` : "Translations",
        subject: bucket.language?.id,
        tallies,
        project: bucket.project,
        link: bucket.link ? { label: "Open in editor", url: bucket.link } : undefined,
    };
}

function backoff(attempts: number): number {
    return Math.min(BASE_BACKOFF_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS);
}

/**
 * Buffers Crowdin events and posts them to Discord from an alarm. Nothing leaves storage until Discord
 * has taken it.
 */
export class Batcher {
    private readonly storage: Storage;
    private readonly webhookUrl: string;

    constructor(storage: Storage, webhookUrl: string) {
        this.storage = storage;
        this.webhookUrl = webhookUrl;
    }

    async receive(events: unknown[]): Promise<void> {
        const now = Date.now();
        let seq = (await this.storage.get<number>(SEQ)) ?? 0;

        for (const [key, entry] of await this.storage.list<Outgoing>({ prefix: OUT })) {
            if (entry.parked) await this.storage.put(key, { ...entry, parked: false, attempts: 0, dueAt: now });
        }

        const buckets = new Map<string, Bucket | undefined>();
        for (const event of events) {
            const item = classify(event);
            if (!item) {
                const name = first(obj(event)?.event) ?? "Crowdin event";
                await this.enqueue(seq++, { message: render(event), label: name, dueAt: now, attempts: 0 });
                continue;
            }
            const key = BUCKET + item.key;
            const bucket = buckets.has(key) ? buckets.get(key) : await this.storage.get<Bucket>(key);
            buckets.set(key, merge(bucket, item, now));
        }
        for (const [key, bucket] of buckets) await this.storage.put(key, bucket);
        await this.storage.put(SEQ, seq);
        await this.schedule();
    }

    async alarm(): Promise<void> {
        const now = Date.now();
        let seq = (await this.storage.get<number>(SEQ)) ?? 0;
        for (const [key, bucket] of await this.storage.list<Bucket>({ prefix: BUCKET })) {
            if (dueAt(bucket) > now) continue;
            const content = summary(bucket);
            const label = tallyLine(content.subject, content.tallies);
            await this.enqueue(seq++, { message: crowdinSummary(content), label, dueAt: now, attempts: 0 });
            await this.storage.delete(key);
        }
        await this.storage.put(SEQ, seq);
        await this.drain();
        await this.schedule();
    }

    private async enqueue(seq: number, entry: Outgoing): Promise<void> {
        await this.storage.put(OUT + String(seq).padStart(12, "0"), entry);
    }

    private async drain(): Promise<void> {
        let target: URL;
        try {
            target = webhookTarget(this.webhookUrl);
        } catch {
            console.error("DISCORD_WEBHOOK_URL is not a valid URL");
            await this.storage.put(NOT_BEFORE, Date.now() + MAX_BACKOFF_MS);
            return;
        }

        const queue = await this.storage.list<Outgoing>({ prefix: OUT });
        let waiting = queue.size;
        for (const [key, entry] of queue) {
            if (entry.parked) continue;
            const now = Date.now();
            const notBefore = (await this.storage.get<number>(NOT_BEFORE)) ?? 0;
            // Stop at the first message that cannot go yet so later ones never overtake it.
            if (entry.dueAt > now || notBefore > now) return;

            const outcome = await send(target, entry.message);
            if (outcome.ok) {
                await this.storage.delete(key);
                waiting -= 1;
                if (outcome.waitMs > 0) await this.storage.put(NOT_BEFORE, Date.now() + outcome.waitMs);
                continue;
            }

            const failedAt = Date.now();
            const attempts = entry.attempts + 1;
            const waitMs = outcome.retryMs ?? backoff(attempts);
            if (outcome.rateLimited) await this.storage.put(NOT_BEFORE, failedAt + waitMs);
            if (attempts >= MAX_ATTEMPTS) {
                console.error(
                    `Discord refused a message ${attempts} times (last status ${outcome.status}). ` +
                        `Kept until the next webhook arrives: ${entry.label}`,
                );
                await this.storage.put(key, { ...entry, attempts, parked: true });
                continue;
            }
            console.warn(
                `Discord answered ${outcome.status}. Keeping ${waiting} message(s), next try in ${Math.ceil(waitMs / 1000)}s`,
            );
            await this.storage.put(key, { ...entry, attempts, dueAt: failedAt + waitMs });
            return;
        }
    }

    private async schedule(): Promise<void> {
        const notBefore = (await this.storage.get<number>(NOT_BEFORE)) ?? 0;
        let next = Infinity;
        for (const bucket of (await this.storage.list<Bucket>({ prefix: BUCKET })).values()) {
            next = Math.min(next, dueAt(bucket));
        }
        // The queue drains in order, so only its first live message decides when it can move.
        for (const entry of (await this.storage.list<Outgoing>({ prefix: OUT })).values()) {
            if (entry.parked) continue;
            next = Math.min(next, Math.max(entry.dueAt, notBefore));
            break;
        }
        if (next === Infinity) await this.storage.deleteAlarm();
        else await this.storage.setAlarm(next);
    }
}
