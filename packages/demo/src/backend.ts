import { answerCommandFault, ART_COMMAND, createFaultSet, withMissingArt, type FaultSet } from "./faults";

export type Args = Record<string, unknown>;
export type Handler = (args: Args) => unknown;
export type Handlers = Record<string, Handler>;
/** Initial key-value contents: store name, then key. */
export type KvSeed = Record<string, Record<string, unknown>>;

export interface Backend {
    handle(command: string, args: Args): unknown;
    /** Answers `command` with `handler` from now on. */
    set(command: string, handler: Handler): void;
    /** Every command that was invoked with nothing to answer it, in first-seen order. */
    unhandled(): string[];
}

// The real bridge carries arguments and results as JSON, so neither side ever holds the other's objects.
// Raw bytes are the exception: they cross as they are.
function copy<T>(value: T): T {
    if (value === undefined || value instanceof Uint8Array) return value;
    return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Stands in for the Rust backend. The key-value commands are built in, `plugin:*` calls answer null, and a
 * command with no handler warns once and throws. `faults` answer ahead of all of them.
 */
export function createBackend(handlers: Handlers, kvSeed: KvSeed, faults: FaultSet = createFaultSet()): Backend {
    const active = new Map(Object.entries(handlers));
    const kv = new Map<string, unknown>();
    for (const [store, entries] of Object.entries(kvSeed)) {
        for (const [key, value] of Object.entries(entries)) kv.set(`${store}\0${key}`, value);
    }
    const slot = (args: Args) => `${String(args.store)}\0${String(args.key)}`;
    const missing = new Set<string>();

    return {
        handle(command, args) {
            const fault = faults.command(command, args);
            if (fault) return answerCommandFault(fault);

            if (command === "kv_get") return copy(kv.get(slot(args)) ?? null);
            if (command === "kv_set") return void kv.set(slot(args), copy(args.value));
            if (command === "kv_delete") return void kv.delete(slot(args));

            const handler = active.get(command);
            if (handler) {
                const result = handler(copy(args));
                const answer = <T>(value: T) =>
                    faults.artMissing() && ART_COMMAND.test(command) ? withMissingArt(value) : copy(value);
                return result instanceof Promise ? result.then(answer) : answer(result);
            }
            if (command.startsWith("plugin:")) return null;

            if (!missing.has(command)) {
                missing.add(command);
                console.warn(`[demo] unhandled command: ${command}`);
            }
            throw new Error(`[demo] unhandled command: ${command}`);
        },
        set: (command, handler) => void active.set(command, handler),
        unhandled: () => [...missing],
    };
}
