import {
    COMPONENTS_V2,
    container,
    linkButton,
    section,
    separator,
    text,
    type Container,
    type TextDisplay,
} from "@deadlock-plus/discord-messages";
import {
    ButtonStyle,
    ComponentType,
    MessageFlags,
    type APIActionRowComponent,
    type APIButtonComponentWithCustomId,
} from "discord-api-types/v10";
import type { Choice, Input } from "./cost";
import type { Kv } from "./env";
import {
    ANNOUNCEMENTS_KEY,
    MAX_ANNOUNCEMENTS,
    MAX_ENVELOPE_BYTES,
    announcementId,
    nextIssuedAt,
    readPayload,
    rfc3339,
    signPayload,
    validateDraft,
    type Announcement,
    type Draft,
    type Severity,
} from "./feed";

export const CONFIRM_BUTTON = "notice-confirm";
export const CANCEL_BUTTON = "notice-cancel";
export const DRAFT_PREFIX = "notice-draft:";
/** A preview's buttons stay on screen for a while; past this, Confirm asks for a new preview. */
const DRAFT_TTL = 3600;
const POSTED = "posted";

export interface FeedDeps {
    store: Kv;
    /** The `ANNOUNCE_SIGNING_KEY` secret: an Ed25519 private JWK. */
    signingKey: string | undefined;
    now: Date;
}

type ButtonRow = APIActionRowComponent<APIButtonComponentWithCustomId>;

export interface Preview {
    flags: number;
    allowed_mentions: { parse: [] };
    components: (Container | TextDisplay | ButtonRow)[];
}

const NO_KEY = "The `ANNOUNCE_SIGNING_KEY` secret is not set on the bot, so nothing was changed.";
const BAD_KEY = "The `ANNOUNCE_SIGNING_KEY` secret is not an Ed25519 private key (JWK), so nothing was changed.";
const BROKEN =
    "The stored announcements feed is broken, so nothing was changed. Fix or delete the `announcements` key in the Cloudflare dashboard first.";
const NOT_FOUND = "No announcement has that id. Pick one from the list.";

const LABELS: Record<Severity, string> = { info: "Info", warning: "Warning", critical: "Critical" };
const ACCENTS: Record<Severity, number> = { info: 0x5865f2, warning: 0xf0b232, critical: 0xda373c };
const PLATFORM_NAMES = { windows: "Windows", linux: "Linux" } as const;

type Loaded = { ok: true; announcements: Announcement[]; issuedAt: string | undefined } | { ok: false };

async function load(store: Kv): Promise<Loaded> {
    const raw = await store.get(ANNOUNCEMENTS_KEY);
    if (raw === null) return { ok: true, announcements: [], issuedAt: undefined };
    const payload = readPayload(raw);
    return payload ? { ok: true, announcements: payload.announcements, issuedAt: payload.issuedAt } : { ok: false };
}

/** Signs and stores the whole list, or gives back why nothing was written. */
async function publish(deps: FeedDeps, announcements: Announcement[], previous: string | undefined) {
    if (!deps.signingKey) return NO_KEY;
    const payload = { version: 1 as const, issuedAt: nextIssuedAt(previous, deps.now), announcements };
    let envelope: string;
    try {
        envelope = JSON.stringify(await signPayload(payload, deps.signingKey));
    } catch {
        return BAD_KEY;
    }
    if (new TextEncoder().encode(envelope).length > MAX_ENVELOPE_BYTES) {
        return "The feed would pass 64 KiB, so nothing was changed. Remove an old announcement first.";
    }
    await deps.store.put(ANNOUNCEMENTS_KEY, envelope);
    return null;
}

/** The app shows plain text, so the preview must not render Discord markdown or mentions either. */
function plain(value: string): string {
    return value.replace(/[\\*_~`|<>#\-[\]()]/g, "\\$&");
}

function when(at: string): string {
    return `<t:${Math.floor(Date.parse(at) / 1000)}:f>`;
}

function targeting(item: Draft): string {
    const versions = item.versions ? `versions \`${item.versions}\`` : "every version";
    const platforms = item.platforms?.length === 1 ? `${PLATFORM_NAMES[item.platforms[0]!]} only` : "Windows and Linux";
    const from = item.startsAt ? `from ${when(item.startsAt)}` : "from now";
    const until = item.endsAt ? `until ${when(item.endsAt)}` : "until ended";
    return `${versions}, ${platforms}, ${from} ${until}`;
}

function card(draft: Draft): Container {
    const dismiss = draft.severity === "critical" ? "cannot be dismissed" : "can be dismissed";
    const heading = text(`**${LABELS[draft.severity]}** (${dismiss}) for ${targeting(draft)}`);
    const content = text(`### ${plain(draft.title)}\n${plain(draft.body)}`);
    return container(
        [heading, separator(), draft.link ? section(content, linkButton(draft.link.label, draft.link.url)) : content],
        ACCENTS[draft.severity],
    );
}

export async function previewPost(input: Input, draftId: string, deps: FeedDeps): Promise<Preview | string> {
    const draft = validateDraft(input, deps.now);
    if (typeof draft === "string") return draft;
    if (!deps.signingKey) return NO_KEY;
    const loaded = await load(deps.store);
    if (!loaded.ok) return BROKEN;
    const id = announcementId(
        draft.title,
        deps.now,
        loaded.announcements.map((item) => item.id),
    );
    await deps.store.put(`${DRAFT_PREFIX}${draftId}`, JSON.stringify(draft), { expirationTtl: DRAFT_TTL });
    const button = (
        custom_id: string,
        label: string,
        style: ButtonStyle.Success | ButtonStyle.Secondary,
    ): APIButtonComponentWithCustomId => ({
        type: ComponentType.Button,
        style,
        label,
        custom_id: `${custom_id};${draftId}`,
    });
    return {
        flags: MessageFlags.Ephemeral | COMPONENTS_V2,
        allowed_mentions: { parse: [] },
        components: [
            card(draft),
            text(`Id \`${id}\`. Confirm signs it and puts it in the feed; apps pick it up within 6 hours.`),
            {
                type: ComponentType.ActionRow,
                components: [
                    button(CONFIRM_BUTTON, "Confirm", ButtonStyle.Success),
                    button(CANCEL_BUTTON, "Cancel", ButtonStyle.Secondary),
                ],
            },
        ],
    };
}

export async function confirmPost(draftId: string, deps: FeedDeps): Promise<string> {
    const key = `${DRAFT_PREFIX}${draftId}`;
    const stored = await deps.store.get(key);
    if (stored === null) return "This preview has expired, so nothing was posted. Run `/notice post` again.";
    if (stored === POSTED) return "This announcement was already posted.";
    if (!deps.signingKey) return NO_KEY;
    const loaded = await load(deps.store);
    if (!loaded.ok) return BROKEN;
    if (loaded.announcements.length >= MAX_ANNOUNCEMENTS) {
        return `The feed holds ${MAX_ANNOUNCEMENTS} announcements at most. Remove one with \`/notice remove\` first.`;
    }
    const draft = JSON.parse(stored) as Draft;
    const id = announcementId(
        draft.title,
        deps.now,
        loaded.announcements.map((item) => item.id),
    );
    const failed = await publish(deps, [...loaded.announcements, { id, ...draft }], loaded.issuedAt);
    if (failed) return failed;
    await deps.store.put(key, POSTED, { expirationTtl: DRAFT_TTL });
    return `Posted \`${id}\`. Apps pick it up within 6 hours.`;
}

export function cancelPost(): string {
    return "Cancelled. Nothing was posted.";
}

type State = "Live" | "Scheduled" | "Ended";

function state(item: Announcement, now: Date): State {
    if (item.endsAt && Date.parse(item.endsAt) <= now.getTime()) return "Ended";
    if (item.startsAt && Date.parse(item.startsAt) > now.getTime()) return "Scheduled";
    return "Live";
}

export async function listFeed(deps: FeedDeps): Promise<string> {
    const loaded = await load(deps.store);
    if (!loaded.ok) return BROKEN;
    if (!loaded.announcements.length) return "No announcements are in the feed.";
    const groups: State[] = ["Live", "Scheduled", "Ended"];
    return groups
        .flatMap((group) => {
            const items = loaded.announcements.filter((item) => state(item, deps.now) === group);
            if (!items.length) return [];
            return [
                `**${group}**`,
                ...items.map(
                    (item) => `- \`${item.id}\` ${LABELS[item.severity]}: ${plain(item.title)} (${targeting(item)})`,
                ),
            ];
        })
        .join("\n");
}

async function change(
    id: unknown,
    deps: FeedDeps,
    edit: (items: Announcement[], index: number) => Announcement[] | string,
): Promise<string | null> {
    const loaded = await load(deps.store);
    if (!loaded.ok) return BROKEN;
    const index = loaded.announcements.findIndex((item) => item.id === id);
    if (index < 0) return NOT_FOUND;
    const edited = edit(loaded.announcements, index);
    if (typeof edited === "string") return edited;
    return publish(deps, edited, loaded.issuedAt);
}

export async function endAnnouncement(id: unknown, deps: FeedDeps): Promise<string> {
    const failed = await change(id, deps, (items, index) => {
        const item = items[index]!;
        if (state(item, deps.now) === "Ended") return "That announcement has already ended.";
        return items.map((other, i) => (i === index ? { ...other, endsAt: rfc3339(deps.now) } : other));
    });
    return failed ?? `Ended \`${String(id)}\`. Apps hide it at their next check, within 6 hours.`;
}

export async function removeAnnouncement(id: unknown, deps: FeedDeps): Promise<string> {
    const failed = await change(id, deps, (items, index) => items.filter((_, i) => i !== index));
    return failed ?? `Removed \`${String(id)}\`. Apps drop it at their next check, within 6 hours.`;
}

export async function feedChoices(typed: string, store: Kv): Promise<Choice[]> {
    const loaded = await load(store);
    if (!loaded.ok) return [];
    const needle = typed.toLowerCase();
    return loaded.announcements
        .filter((item) => item.id.includes(needle) || item.title.toLowerCase().includes(needle))
        .slice(0, 25)
        .map((item) => ({ name: `${item.id} · ${item.title}`.slice(0, 100), value: item.id }));
}
