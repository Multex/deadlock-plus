import { enginePingLatest, networkPoll, startNetworkMonitor } from "./api";
import { appendPoint, historySeries, mergeTail } from "./connection";
import type { EnginePingView, HistoryPoint, NetworkSnapshot } from "./types";

class NetworkMonitor {
    snap = $state.raw<NetworkSnapshot | null>(null);
    history = $state.raw<HistoryPoint[]>([]);
    engine = $state.raw<EnginePingView | null>(null);
    engineHistory = $state.raw<HistoryPoint[]>([]);
    readonly chart = $derived(historySeries(this.engine ? this.engineHistory : this.history));
    monitorFailed = $state(false);
    pollFailed = $state(false);
    readonly failed = $derived(this.monitorFailed || this.pollFailed);

    async start(allowPrompt = false) {
        try {
            await startNetworkMonitor(allowPrompt);
            this.monitorFailed = false;
        } catch {
            this.monitorFailed = true;
        }
        await this.refresh();
    }

    async refresh() {
        try {
            const poll = await networkPoll(this.history.at(-1)?.t ?? null);
            this.snap = poll.snapshot;
            this.history = mergeTail(this.history, poll.tail);
            this.pollFailed = false;
        } catch {
            this.pollFailed = true;
            return;
        }
        try {
            this.engine = await enginePingLatest();
            this.engineHistory = this.engine
                ? appendPoint(this.engineHistory, { t: Date.now(), raw: this.engine.pingMs })
                : [];
        } catch {
            // The game's own ping is optional; the relay history above still drew.
        }
    }

    retry() {
        return this.start(true);
    }

    reset() {
        this.snap = null;
        this.history = [];
        this.engine = null;
        this.engineHistory = [];
        this.monitorFailed = false;
        this.pollFailed = false;
    }
}

export const networkMonitor = new NetworkMonitor();
