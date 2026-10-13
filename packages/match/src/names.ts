import type { MatchDetail } from "./detail";

export const NAME_BATCH = 50;
export const NAME_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_STORED = 2000;

interface StoredName {
    n: string;
    at: number;
}

export type StoredNames = Record<string, StoredName>;

export function batchIds(ids: number[], size = NAME_BATCH): number[][] {
    const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
    const out: number[][] = [];
    for (let i = 0; i < unique.length; i += size) out.push(unique.slice(i, i + size));
    return out;
}

/** A private or never-seen profile is absent from the body or has no persona name; both yield no entry. */
export function parseNames(body: unknown): Map<number, string> {
    const out = new Map<number, string>();
    if (!Array.isArray(body)) return out;
    for (const row of body) {
        if (typeof row !== "object" || row === null) continue;
        const { account_id: id, personaname: name } = row as Record<string, unknown>;
        if (typeof id !== "number" || typeof name !== "string") continue;
        const trimmed = name.trim();
        if (trimmed) out.set(id, trimmed);
    }
    return out;
}

export function withNames(detail: MatchDetail, names: ReadonlyMap<number, string>): MatchDetail {
    const teams = detail.teams.map((team) => ({
        ...team,
        players: team.players.map((p) => {
            const name = names.get(p.accountId);
            return name === undefined ? p : { ...p, name };
        }),
    }));
    return { ...detail, teams: teams as MatchDetail["teams"] };
}

export function parseStoredNames(raw: unknown, now: number): Map<number, StoredName> {
    const out = new Map<number, StoredName>();
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
    for (const [key, value] of Object.entries(raw)) {
        const id = Number(key);
        if (!Number.isInteger(id) || id <= 0 || typeof value !== "object" || value === null) continue;
        const { n, at } = value as Partial<StoredName>;
        if (typeof n !== "string" || typeof at !== "number" || now - at > NAME_TTL_MS) continue;
        out.set(id, { n, at });
    }
    return out;
}

function toStored(entries: Map<number, StoredName>): StoredNames {
    const newest = [...entries].sort((a, b) => b[1].at - a[1].at).slice(0, MAX_STORED);
    return Object.fromEntries(newest.map(([id, v]) => [String(id), v]));
}

export interface NameDeps {
    fetchBatch(ids: number[]): Promise<unknown>;
    load(): Promise<unknown>;
    save(names: StoredNames): Promise<void>;
    now(): number;
}

export class NameResolver {
    private known = new Map<number, StoredName>();
    private unknown = new Set<number>();
    private loading: Promise<void> | null = null;

    constructor(
        private deps: NameDeps,
        private batchSize = NAME_BATCH,
    ) {}

    private hydrate(): Promise<void> {
        this.loading ??= this.deps
            .load()
            .then((raw) => {
                for (const [id, v] of parseStoredNames(raw, this.deps.now())) this.known.set(id, v);
            })
            .catch(() => {});
        return this.loading;
    }

    async resolve(ids: number[]): Promise<Map<number, string>> {
        await this.hydrate();
        const wanted = batchIds(ids, Number.MAX_SAFE_INTEGER).flat();
        const missing = wanted.filter((id) => !this.known.has(id) && !this.unknown.has(id));

        let added = false;
        for (const batch of batchIds(missing, this.batchSize)) {
            try {
                const found = parseNames(await this.deps.fetchBatch(batch));
                const at = this.deps.now();
                for (const id of batch) {
                    const name = found.get(id);
                    if (name === undefined) this.unknown.add(id);
                    else {
                        this.known.set(id, { n: name, at });
                        added = true;
                    }
                }
            } catch {
                // A failed batch leaves those players unnamed and is retried on the next open.
            }
        }
        if (added) void this.deps.save(toStored(this.known)).catch(() => {});

        const out = new Map<number, string>();
        for (const id of wanted) {
            const entry = this.known.get(id);
            if (entry) out.set(id, entry.n);
        }
        return out;
    }
}
