import { toast } from "svelte-sonner";
import { errorCode, errorText, failureText } from "$lib/core/errors";
import { t, tn } from "$lib/core/i18n.svelte";
import { saveTextFile } from "$lib/core/files";
import { openProfile, parseSteamId, steam64ToSteam32 } from "$lib/core/player-links";
import { readVoiceBan, writeVoiceBan, type VoiceBanFile } from "./api";
import { filterMuted, mutedIds, pageCount as countPages, pageSlice, pruneSelection, toggleIds } from "./list";
import { lookupProfiles, searchPlayers, type Profile } from "./profiles";
import { addMutedUsers, buildExport, parseImport, parseVoiceBan, removeMutedUsers } from "./voice-ban";

export class Mutes {
    file = $state<VoiceBanFile | null>(null);
    error = $state<string | null>(null);
    /** Steam has no signed-in account on this PC, so there is no mute file to read or change. */
    noAccount = $state(false);
    loading = $state(true);
    busy = $state(false);
    filter = $state("");
    page = $state(0);
    selected = $state<Set<string>>(new Set());
    profiles = $state<Record<string, Profile>>({});
    addInput = $state("");
    searchResults = $state<Profile[] | null>(null);
    searching = $state(false);
    unmuteOpen = $state(false);
    unmuteIds = $state<string[]>([]);
    importOpen = $state(false);
    importIds = $state<string[]>([]);
    /** The ids of `importIds` not muted when the file was chosen: muting them must not reword the open question. */
    newImportIds = $state<string[]>([]);

    private requested = new Set<string>();

    muted = $derived(mutedIds(this.file));
    mutedSet = $derived(new Set(this.muted));
    filtered = $derived(filterMuted(this.muted, this.filter, this.profiles));
    pageCount = $derived(countPages(this.filtered.length));
    visible = $derived(pageSlice(this.filtered, this.page));
    allVisibleSelected = $derived(this.visible.length > 0 && this.visible.every((id) => this.selected.has(id)));
    locked = $derived(this.file?.gameRunning === true);

    /** Registers effects, so it must run during component initialisation. */
    constructor() {
        $effect(() => {
            this.fetchProfiles(this.visible);
        });

        // Name filtering needs every profile, so the rest load once the user starts searching.
        $effect(() => {
            if (this.filter.trim()) this.fetchProfiles(this.muted);
        });

        $effect(() => {
            this.filter;
            this.page = 0;
        });

        $effect(() => {
            if (this.page >= this.pageCount) this.page = this.pageCount - 1;
        });
    }

    async load() {
        this.loading = true;
        try {
            this.file = await readVoiceBan();
            this.error = null;
            this.noAccount = false;
            const known = this.file.exists ? parseVoiceBan(this.file.text).users.map((u) => u.steamid64) : [];
            this.selected = pruneSelection(this.selected, known);
        } catch (e) {
            this.noAccount = errorCode(e) === "voice_bans.no_account";
            if (this.noAccount) {
                this.file = null;
                this.error = null;
            } else {
                this.error = errorText(e);
            }
        } finally {
            this.loading = false;
        }
    }

    private fetchProfiles(ids: string[]) {
        const fresh = ids.filter((id) => !this.requested.has(id));
        fresh.forEach((id) => this.requested.add(id));
        if (fresh.length === 0) return;
        void lookupProfiles(fresh, (batch) => {
            const next = { ...this.profiles };
            for (const p of batch) next[p.steamid64] = p;
            this.profiles = next;
        });
    }

    private async commit(text: string, message: string) {
        if (this.locked) return;
        this.busy = true;
        try {
            const backup = await writeVoiceBan(text);
            toast.success(message, { description: t("voice_bans.toast.backup", { path: backup }) });
            await this.load();
        } catch (e) {
            toast.error(errorText(e));
        } finally {
            this.busy = false;
        }
    }

    askUnmute(ids: string[]) {
        this.unmuteIds = ids;
        this.unmuteOpen = true;
    }

    async confirmUnmute() {
        if (!this.file) return;
        const count = this.unmuteIds.length;
        await this.commit(removeMutedUsers(this.file.text, this.unmuteIds), tn("voice_bans.toast.unmuted", count));
        this.selected = new Set();
    }

    async mute(ids: string[]) {
        if (!this.file) return;
        const { text, added } = addMutedUsers(this.file.text, ids);
        if (added.length === 0) {
            toast.info(t("voice_bans.toast.already_muted"));
            return;
        }
        await this.commit(text, tn("voice_bans.toast.muted", added.length));
        this.addInput = "";
        this.searchResults = null;
    }

    async submitAdd() {
        const value = this.addInput.trim();
        if (!value) return;
        const id = parseSteamId(value);
        if (id) {
            await this.mute([id]);
            return;
        }
        if (/^https?:\/\//i.test(value) || /^\d+$/.test(value)) {
            toast.error(t("voice_bans.toast.not_recognised"));
            return;
        }
        this.searching = true;
        try {
            this.searchResults = await searchPlayers(value);
        } catch (e) {
            toast.error(failureText(e, t("voice_bans.toast.search_failed")));
        } finally {
            this.searching = false;
        }
    }

    openStatlocker(id: string) {
        void openProfile("statlocker", Number(steam64ToSteam32(id)));
    }

    toggle(id: string, on: boolean) {
        this.selected = toggleIds(this.selected, [id], on);
    }

    toggleVisible(on: boolean) {
        this.selected = toggleIds(this.selected, this.visible, on);
    }

    async exportList(ids: string[]) {
        try {
            const saved = await saveTextFile(
                { defaultName: "deadlock-mutes.json", filterName: "JSON", extension: "json" },
                buildExport(ids),
            );
            if (saved) toast.success(t("voice_bans.toast.exported", { count: ids.length }));
        } catch (e) {
            toast.error(failureText(e, t("voice_bans.toast.export_failed")));
        }
    }

    async importFile(chosen: File) {
        try {
            const ids = parseImport(await chosen.text());
            this.importIds = ids;
            this.newImportIds = ids.filter((id) => !this.mutedSet.has(id));
            this.importOpen = true;
        } catch (e) {
            toast.error(failureText(e, t("voice_bans.toast.import_failed")));
        }
    }
}
