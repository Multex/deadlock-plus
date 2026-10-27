import { createBackend, type Args, type Handler, type Handlers, type KvSeed } from "./backend";
import { shiftClock } from "./clock";
import { createFetch, type ApiRoute } from "./fetch";
import { createFaultSet, type Fault } from "./faults";
import { seeded } from "./random";

/** The invented player a scenario is seen through, and the names of the other invented players. */
export interface Identity {
    accountId: number;
    steamId64: string;
    persona: string;
    names: readonly string[];
}

export interface ScenarioContext {
    identity: Identity;
    /** The scenario's "now", in milliseconds since the epoch. */
    now: number;
    seed: number;
}

/** What one module answers. Each key is a claim: no other module of the scenario may make the same one. */
export interface ModuleParts {
    handlers?: Handlers;
    kv?: KvSeed;
    routes?: ApiRoute[];
}

export interface Module {
    name: string;
    /** Commands this module takes over from a module listed before it. */
    overrides?: readonly string[];
    /**
     * Runs once per install, so any state it closes over belongs to that install alone. `replaced` holds this
     * install's earlier answers to the commands named in `overrides`, so an override can wrap them.
     */
    create(context: ScenarioContext, replaced: Readonly<Handlers>): ModuleParts;
}

export interface ScenarioSpec extends ScenarioContext {
    id: string;
    modules: readonly Module[];
}

export interface Scenario extends ScenarioSpec {
    /** Changes laid over the modules by `with`, oldest first. */
    layers: readonly ModuleParts[];
    /**
     * A copy of this scenario with changes laid over its modules: handlers replace by command, KV values by
     * store and key, and the routes are tried before the scenario's own.
     */
    with(changes: ModuleParts): Scenario;
}

export type EventListener = (event: string, payload: unknown) => void;

/** One running install of a scenario. */
export interface DemoHandle {
    /** Id of the installed scenario. */
    readonly scenario: string;
    invoke(command: string, args: Args): unknown;
    /** Every command that was invoked with nothing to answer it. */
    unhandled(): string[];
    /** Answers `command` with `handler` from now on. */
    set(command: string, handler: Handler): void;
    /** Adds a fault from now on; it wins over every earlier one it overlaps. */
    fault(fault: Fault): void;
    /** Drops every fault, the ones the install started with included. */
    clearFaults(): void;
    /** The faults in effect, oldest first. */
    faults(): Fault[];
    /** Sends a backend event to the frontend, as the Rust side would. */
    emit(event: string, payload: unknown): void;
    /** Subscribes the host that delivers emitted events to the frontend's listeners. */
    onEvent(listener: EventListener): void;
    /** Gives back the real clock, `Math.random` and `fetch`. */
    uninstall(): void;
}

interface Assembled {
    handlers: Handlers;
    kv: KvSeed;
    routes: ApiRoute[];
}

function assemble(spec: ScenarioSpec, layers: readonly ModuleParts[]): Assembled {
    const { id, identity, now, seed } = spec;
    const out: Assembled = { handlers: {}, kv: {}, routes: [] };
    const owners = new Map<string, string>();

    const claim = (kind: string, verb: string, key: string, module: Module, replaces = false) => {
        const slot = `${kind}\0${key}`;
        const owner = owners.get(slot);
        if (replaces && !owner) {
            throw new Error(
                `[demo] scenario "${id}": module "${module.name}" overrides ${kind} "${key}", which no earlier module handles`,
            );
        }
        if (owner && !replaces) {
            throw new Error(
                `[demo] scenario "${id}": modules "${owner}" and "${module.name}" both ${verb} ${kind} "${key}"`,
            );
        }
        owners.set(slot, module.name);
    };

    for (const module of spec.modules) {
        const replaced = Object.fromEntries(
            (module.overrides ?? []).flatMap((command) => {
                const handler = out.handlers[command];
                return handler ? [[command, handler]] : [];
            }),
        );
        const parts = module.create({ identity, now, seed }, replaced);
        for (const [command, handler] of Object.entries(parts.handlers ?? {})) {
            claim("command", "handle", command, module, module.overrides?.includes(command));
            out.handlers[command] = handler;
        }
        for (const [store, entries] of Object.entries(parts.kv ?? {})) {
            for (const key of Object.keys(entries)) claim("KV key", "seed", `${store}/${key}`, module);
            out.kv[store] = { ...out.kv[store], ...entries };
        }
        for (const route of parts.routes ?? []) {
            claim("API route", "answer", route[0].source, module);
            out.routes.push(route);
        }
    }

    for (const layer of layers) {
        Object.assign(out.handlers, layer.handlers);
        for (const [store, entries] of Object.entries(layer.kv ?? {})) out.kv[store] = { ...out.kv[store], ...entries };
        out.routes.unshift(...(layer.routes ?? []));
    }
    return out;
}

function scenarioOf(spec: ScenarioSpec, layers: readonly ModuleParts[]): Scenario {
    return { ...spec, layers, with: (changes) => scenarioOf(spec, [...layers, changes]) };
}

/** Checks the modules' claims and returns the scenario. Throws when two modules claim the same thing. */
export function defineScenario(spec: ScenarioSpec): Scenario {
    assemble(spec, []);
    return scenarioOf(spec, []);
}

/**
 * Starts a scenario with fresh state: moves the clock to its `now`, replaces `Math.random` with its seeded
 * numbers and answers its API routes through the global `fetch`. `faults` break commands, API paths or art
 * from the start.
 */
export function install(scenario: Scenario, options: { faults?: readonly Fault[] } = {}): DemoHandle {
    const { handlers, kv, routes } = assemble(scenario, scenario.layers);
    const faults = createFaultSet(options.faults);
    const backend = createBackend(handlers, kv, faults);
    const listeners = new Set<EventListener>();

    const restoreClock = shiftClock(scenario.now);
    const realRandom = Math.random;
    Math.random = seeded(scenario.seed);
    const realFetch = globalThis.fetch;
    globalThis.fetch = createFetch(routes, (input, init) => realFetch.call(globalThis, input, init), faults);

    return {
        scenario: scenario.id,
        invoke: backend.handle,
        unhandled: backend.unhandled,
        set: backend.set,
        fault: faults.add,
        clearFaults: faults.clear,
        faults: faults.list,
        emit: (event, payload) => listeners.forEach((listener) => listener(event, payload)),
        onEvent: (listener) => void listeners.add(listener),
        uninstall() {
            restoreClock();
            Math.random = realRandom;
            globalThis.fetch = realFetch;
        },
    };
}
