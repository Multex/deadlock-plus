import type { Component } from "svelte";
import {
    Eye,
    Flame,
    Gamepad2,
    Hourglass,
    House,
    LayoutGrid,
    Lock,
    Pause,
    Search,
    Swords,
    Target,
    Trophy,
    CircleCheck,
} from "@lucide/svelte";
import { t } from "$lib/core/i18n.svelte";
import type { PresenceStateId } from "@deadlock-plus/ipc-types/PresenceStateId";
import type { PresenceTimer } from "@deadlock-plus/ipc-types/PresenceTimer";
import type { PresenceVariantId } from "@deadlock-plus/ipc-types/PresenceVariantId";
import type { PlaceholderGroupId, SourceKind } from "./editor";

export const STATE_LABELS: Record<PresenceStateId, () => string> = {
    playing: () => t("settings.discord_editor.state.playing"),
    mainMenu: () => t("settings.discord_editor.state.mainMenu"),
    hideout: () => t("settings.discord_editor.state.hideout"),
    findingMatch: () => t("settings.discord_editor.state.findingMatch"),
    matchFound: () => t("settings.discord_editor.state.matchFound"),
    preGame: () => t("settings.discord_editor.state.preGame"),
    inMatch: () => t("settings.discord_editor.state.inMatch"),
    streetBrawlRound: () => t("settings.discord_editor.state.streetBrawlRound"),
    paused: () => t("settings.discord_editor.state.paused"),
    spectating: () => t("settings.discord_editor.state.spectating"),
    postGame: () => t("settings.discord_editor.state.postGame"),
    privateLobby: () => t("settings.discord_editor.state.privateLobby"),
    practice: () => t("settings.discord_editor.state.practice"),
};

export const STATE_ICONS: Record<PresenceStateId, Component<{ class?: string }>> = {
    playing: Gamepad2,
    mainMenu: LayoutGrid,
    hideout: House,
    findingMatch: Search,
    matchFound: CircleCheck,
    preGame: Hourglass,
    inMatch: Swords,
    streetBrawlRound: Flame,
    paused: Pause,
    spectating: Eye,
    postGame: Trophy,
    privateLobby: Lock,
    practice: Target,
};

export const VARIANT_LABELS: Record<PresenceVariantId, () => string> = {
    solo: () => t("settings.discord_editor.variant.solo"),
    party: () => t("settings.discord_editor.variant.party"),
    unranked: () => t("settings.discord_editor.variant.unranked"),
    ranked: () => t("settings.discord_editor.variant.ranked"),
    bots: () => t("settings.discord_editor.variant.bots"),
    tutorial: () => t("settings.discord_editor.variant.tutorial"),
    normal: () => t("settings.discord_editor.variant.normal"),
    streetBrawl: () => t("settings.discord_editor.variant.streetBrawl"),
    sandbox: () => t("settings.discord_editor.variant.sandbox"),
    exploreNyc: () => t("settings.discord_editor.variant.exploreNyc"),
    won: () => t("settings.discord_editor.variant.won"),
    lost: () => t("settings.discord_editor.variant.lost"),
    unscored: () => t("settings.discord_editor.variant.unscored"),
};

export const PLACEHOLDER_HELP: Record<string, () => string> = {
    hero: () => t("settings.discord_editor.placeholder.hero"),
    heroPresence: () => t("settings.discord_editor.placeholder.heroPresence"),
    mode: () => t("settings.discord_editor.placeholder.mode"),
    gameMode: () => t("settings.discord_editor.placeholder.gameMode"),
    rank: () => t("settings.discord_editor.placeholder.rank"),
    kills: () => t("settings.discord_editor.placeholder.kills"),
    deaths: () => t("settings.discord_editor.placeholder.deaths"),
    assists: () => t("settings.discord_editor.placeholder.assists"),
    souls: () => t("settings.discord_editor.placeholder.souls"),
    partySize: () => t("settings.discord_editor.placeholder.partySize"),
    partyMax: () => t("settings.discord_editor.placeholder.partyMax"),
    round: () => t("settings.discord_editor.placeholder.round"),
    scoreAmber: () => t("settings.discord_editor.placeholder.scoreAmber"),
    scoreSapphire: () => t("settings.discord_editor.placeholder.scoreSapphire"),
    elapsed: () => t("settings.discord_editor.placeholder.elapsed"),
    queueTime: () => t("settings.discord_editor.placeholder.queueTime"),
    result: () => t("settings.discord_editor.placeholder.result"),
    matchId: () => t("settings.discord_editor.placeholder.matchId"),
};

export const PLACEHOLDER_GROUP_LABELS: Record<PlaceholderGroupId, () => string> = {
    you: () => t("settings.discord_editor.syntax.group_you"),
    match: () => t("settings.discord_editor.syntax.group_match"),
    party: () => t("settings.discord_editor.syntax.group_party"),
    streetBrawl: () => t("settings.discord_editor.syntax.group_streetBrawl"),
    other: () => t("settings.discord_editor.syntax.group_misc"),
};

export const SYNTAX_LABELS = {
    rules: [
        () => t("settings.discord_editor.syntax.rule_length"),
        () => t("settings.discord_editor.syntax.rule_empty"),
        () => t("settings.discord_editor.syntax.rule_unclosed"),
        () => t("settings.discord_editor.syntax.rule_unknown"),
    ],
};

export const TIMER_LABELS: Record<PresenceTimer, () => string> = {
    none: () => t("settings.discord_editor.timer_none"),
    elapsedInState: () => t("settings.discord_editor.timer_elapsedInState"),
    matchTime: () => t("settings.discord_editor.timer_matchTime"),
    queueTime: () => t("settings.discord_editor.timer_queueTime"),
};

export const SOURCE_LABELS: Record<SourceKind, () => string> = {
    heroPortrait: () => t("settings.discord_editor.source_heroPortrait"),
    heroIcon: () => t("settings.discord_editor.source_heroIcon"),
    rankBadge: () => t("settings.discord_editor.source_rankBadge"),
    modeIcon: () => t("settings.discord_editor.source_modeIcon"),
    customUrl: () => t("settings.discord_editor.source_customUrl"),
};
