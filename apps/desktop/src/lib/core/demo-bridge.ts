import { install, scenarioFactory, selectScenarioId, type DemoHandle } from "@deadlock-plus/demo";
import { emit } from "@tauri-apps/api/event";
import { mockConvertFileSrc, mockIPC, mockWindows } from "@tauri-apps/api/mocks";

import CHANGELOG from "../../../../../CHANGELOG.md?raw";
import MAP_ITEMS_TSV from "../../../../../crates/ring2/dp-gamedata/fixtures/map_items.tsv?raw";
import { version as APP_VERSION } from "../../../package.json";

/** What a test reads from the page. Before load it may hold only `scenario`, to pick the one to start. */
export interface DemoWindowHook {
    scenario: string;
    unhandled(): string[];
    handle: DemoHandle;
}

declare global {
    interface Window {
        __DEADLOCK_PLUS_DEMO__?: Partial<DemoWindowHook>;
    }
}

interface TauriInternals {
    convertFileSrc(path: string, protocol?: string): string;
}

/** Replaces Tauri's IPC bridge, so every `invoke`, plugin call and event subscription goes to `handle`. */
function installBridge(handle: DemoHandle): void {
    mockWindows("main");
    mockConvertFileSrc("windows");
    mockIPC((command, args) => handle.invoke(command, (args ?? {}) as Record<string, unknown>), {
        shouldMockEvents: true,
    });
    handle.onEvent((event, payload) => void emit(event, payload));

    // Art commands answer with local file paths that the frontend turns into asset URLs. A demo has no
    // local files, so its art paths are public image URLs and must reach the page unchanged.
    const internals = (window as unknown as { __TAURI_INTERNALS__: TauriInternals }).__TAURI_INTERNALS__;
    const local = internals.convertFileSrc;
    internals.convertFileSrc = (path, protocol) => (/^https?:\/\//.test(path) ? path : local(path, protocol));
}

/**
 * Runs the frontend in a plain browser on a scenario of made-up data. The scenario is the one a test named
 * on `window.__DEADLOCK_PLUS_DEMO__` before load, else the `demo` query parameter, else `buildValue`; the query
 * is read here, once, because in-app navigation drops it.
 */
export function startDemo(buildValue: string): void {
    const id = selectScenarioId({
        hook: window.__DEADLOCK_PLUS_DEMO__?.scenario,
        query: new URLSearchParams(window.location.search).get("demo"),
        env: buildValue,
    });
    const scenario = scenarioFactory(id)({
        appVersion: APP_VERSION,
        changelog: CHANGELOG,
        mapItemsTsv: MAP_ITEMS_TSV,
    });
    const handle = install(scenario);
    installBridge(handle);
    window.__DEADLOCK_PLUS_DEMO__ = { scenario: handle.scenario, unhandled: handle.unhandled, handle };
}
