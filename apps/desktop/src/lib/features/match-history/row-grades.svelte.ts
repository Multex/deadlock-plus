import { SvelteMap } from "svelte/reactivity";
import type { MvpMatchGrade } from "@deadlock-plus/ipc-types/MvpMatchGrade";
import type { MvpPlayerGrade } from "@deadlock-plus/ipc-types/MvpPlayerGrade";
import { steamAccount } from "$lib/features/steam-account/account.svelte";
import { onGraded, readGrades } from "./mvp";

export interface RowGradeDeps {
    readGrades(matchIds: number[]): Promise<MvpMatchGrade[]>;
    listen(handler: (matchIds: number[]) => void): Promise<() => void>;
    accountId(): number | null;
    schedule(run: () => void): void;
}

/**
 * Stored grades for the match-list rows on screen. Rows that mount together are read with one call; a
 * `mvp://graded` event re-reads the rows it names that are still on screen. A grade is extra: failures
 * leave the rows as they were.
 */
export class RowGrades {
    private grades = new SvelteMap<number, MvpMatchGrade>();
    private watched = new Map<number, number>();
    private pending = new Set<number>();
    private listening = false;

    constructor(private deps: RowGradeDeps) {}

    watch(matchId: number): () => void {
        this.watched.set(matchId, (this.watched.get(matchId) ?? 0) + 1);
        this.startListening();
        if (!this.grades.has(matchId)) this.queue(matchId);

        let released = false;
        return () => {
            if (released) return;
            released = true;
            const left = (this.watched.get(matchId) ?? 1) - 1;
            if (left > 0) this.watched.set(matchId, left);
            else this.watched.delete(matchId);
        };
    }

    /** Your own grade in the match, or null while unread, ungraded, or when you were not graded. */
    own(matchId: number): MvpPlayerGrade | null {
        const accountId = this.deps.accountId();
        if (accountId === null) return null;
        return this.grades.get(matchId)?.players.find((p) => p.accountId === accountId) ?? null;
    }

    private queue(matchId: number) {
        if (this.pending.size === 0) this.deps.schedule(() => this.flush());
        this.pending.add(matchId);
    }

    private flush() {
        const ids = [...this.pending];
        this.pending.clear();
        this.read(ids);
    }

    private read(ids: number[]) {
        if (ids.length === 0) return;
        this.deps.readGrades(ids).then(
            (found) => found.forEach((g) => this.grades.set(g.matchId, g)),
            () => {},
        );
    }

    private startListening() {
        if (this.listening) return;
        this.listening = true;
        this.deps
            .listen((ids) => this.read(ids.filter((id) => this.watched.has(id))))
            .catch(() => {
                this.listening = false;
            });
    }
}

export const rowGrades = new RowGrades({
    readGrades,
    listen: onGraded,
    accountId: () => steamAccount.account?.steamId32 ?? null,
    schedule: (run) => queueMicrotask(run),
});
