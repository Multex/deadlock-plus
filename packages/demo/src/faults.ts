import type { Args } from "./backend";

export type CommandFaultMode = "throw" | "null" | "hang" | "garbage";
export type ApiFaultMode = "503" | "429" | "drop" | "garbage" | "slow";

export type Fault =
    /** `key` ("store/key") narrows a `kv_*` fault to one key. */
    | {
          command: string;
          mode: CommandFaultMode;
          error?: { code: string; params?: Record<string, string> };
          key?: string;
      }
    /** `api` is a path prefix on the Deadlock API host; "" is every path. */
    | { api: string; mode: ApiFaultMode }
    | { art: "missing" };

export type CommandFault = Extract<Fault, { command: string }>;
export type ApiFault = Extract<Fault, { api: string }>;

/** What a `throw` fault rejects with when it names no error: the shape the Rust side reports. */
export const FAULT_ERROR = { code: "common.internal", params: {} };
/** What a `garbage` fault answers: valid JSON that matches no command's or route's shape. */
export const GARBAGE = { garbage: true };
export const SLOW_API_MS = 5000;

const COMMAND_MODES: readonly string[] = ["throw", "null", "hang", "garbage"] satisfies CommandFaultMode[];
const API_MODES: readonly string[] = ["503", "429", "drop", "garbage", "slow"] satisfies ApiFaultMode[];

/** The faults in effect for one install. The newest fault that matches wins. */
export interface FaultSet {
    add(fault: Fault): void;
    clear(): void;
    list(): Fault[];
    command(command: string, args: Args): CommandFault | undefined;
    api(path: string): ApiFault | undefined;
    artMissing(): boolean;
}

export function createFaultSet(initial: readonly Fault[] = []): FaultSet {
    const faults = [...initial];
    const newest = <T extends Fault>(match: (fault: Fault) => fault is T): T | undefined => faults.findLast(match);

    return {
        add: (fault) => void faults.push(fault),
        clear: () => void faults.splice(0),
        list: () => [...faults],
        command: (command, args) =>
            newest(
                (fault): fault is CommandFault =>
                    "command" in fault &&
                    fault.command === command &&
                    (fault.key === undefined || fault.key === `${String(args.store)}/${String(args.key)}`),
            ),
        api: (path) => newest((fault): fault is ApiFault => "api" in fault && path.startsWith(fault.api)),
        artMissing: () => faults.some((fault) => "art" in fault),
    };
}

/** Throws, hangs or answers in place of the command's handler. */
export function answerCommandFault(fault: CommandFault): unknown {
    switch (fault.mode) {
        case "throw":
            throw fault.error ? { code: fault.error.code, params: fault.error.params ?? {} } : { ...FAULT_ERROR };
        case "null":
            return null;
        case "hang":
            return new Promise(() => {});
        case "garbage":
            return structuredClone(GARBAGE);
    }
}

const rateLimited = () =>
    new Response(
        JSON.stringify({
            type: "ip",
            quota: { limit: 30, period: 60 },
            requests: 31,
            remaining: 0,
            next_request_in: 12,
        }),
        {
            status: 429,
            statusText: "Too Many Requests",
            headers: {
                "Content-Type": "application/json",
                "Retry-After": "12",
                "RateLimit-Limit": "30",
                "RateLimit-Period": "60",
                "RateLimit-Remaining": "0",
                "RateLimit-Reset": "12",
            },
        },
    );

/** Answers a faulted API request; `slow` hands it on to `answer` late. */
export async function answerApiFault(fault: ApiFault, answer: () => Promise<Response>): Promise<Response> {
    switch (fault.mode) {
        case "503":
            return new Response("503 Service Unavailable", { status: 503, statusText: "Service Unavailable" });
        case "429":
            return rateLimited();
        case "drop":
            throw new TypeError("Failed to fetch");
        case "garbage":
            return Response.json(GARBAGE);
        case "slow":
            await new Promise((resolve) => setTimeout(resolve, SLOW_API_MS));
            return answer();
    }
}

// `.invalid` never resolves, so an image pointed here fails to load at once and never reaches a real host.
const MISSING_ART = "https://missing-art.invalid/";

export function missingArtUrl(path: string): string {
    return MISSING_ART + encodeURIComponent(path.split(/[\\/]/).pop() || "art");
}

export function isMissingArtUrl(url: string): boolean {
    return url.startsWith(MISSING_ART);
}

export const ART_COMMAND = /^game_\w+_art$/;
const IMAGE_LOCATION = /^(https?:|asset:|file:|data:image\/)|^[A-Za-z]:[\\/]|^\/|\.(png|webp|svg|jpe?g|gif|avif)$/i;

/** `value` with every image path or URL in it pointed at a missing image. */
export function withMissingArt(value: unknown): unknown {
    if (typeof value === "string") return IMAGE_LOCATION.test(value) ? missingArtUrl(value) : value;
    if (Array.isArray(value)) return value.map(withMissingArt);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, withMissingArt(inner)]));
    }
    return value;
}

function invalid(entry: string): never {
    throw new Error(
        `[demo] cannot read fault "${entry}" (expected command:<name>:<${COMMAND_MODES.join("|")}>[:key=<store/key>][:code=<code>], api:<prefix>:<${API_MODES.join("|")}> or art:missing)`,
    );
}

function parseFault(entry: string): Fault {
    const [kind, target = "", mode = "", ...extras] = entry.split(":");
    if (kind === "art" && target === "missing" && !mode) return { art: "missing" };
    if (kind === "api" && API_MODES.includes(mode) && !extras.length)
        return { api: target, mode: mode as ApiFaultMode };
    if (kind !== "command" || !target || !COMMAND_MODES.includes(mode)) invalid(entry);

    const fault: CommandFault = { command: target, mode: mode as CommandFaultMode };
    for (const extra of extras) {
        const [name, value] = extra.split("=", 2);
        if (!value) invalid(entry);
        if (name === "key") fault.key = value;
        else if (name === "code") fault.error = { code: value, params: {} };
        else invalid(entry);
    }
    return fault;
}

/** Reads the `fault` query value: comma-separated entries, such as `command:gc_status:throw,api:/v1/players:503,art:missing`. */
export function parseFaults(query: string | null | undefined): Fault[] {
    return (query ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map(parseFault);
}

export interface FaultChoice {
    /** Set on the page by a test before it loads. */
    hook?: readonly Fault[] | null;
    /** The `fault` query parameter of the first URL. */
    query?: string | null;
}

/** The faults to start with: the hook's when a test set them, else the query's. */
export function selectFaults({ hook, query }: FaultChoice): readonly Fault[] {
    return hook ?? parseFaults(query);
}
