<script lang="ts">
    import type { Snippet } from "svelte";
    import { Ellipsis, Heart, MessageCircle, Play, Send } from "@lucide/svelte";
    import { t } from "$lib/core/i18n.svelte";
    import type { StageFrame } from "./share-sheet";

    /**
     * The file where it ends up: a phone for a tall one, a feed post, a video player, or a chat message for a
     * fixed page. `media` is the box the file fills; `played` (0 to 1) moves the player's bar.
     */
    let {
        frame,
        media,
        played = 0,
        clock = "",
        children,
    }: {
        frame: StageFrame;
        media: { w: number; h: number };
        played?: number;
        clock?: string;
        children: Snippet;
    } = $props();
</script>

{#if frame === "phone"}
    <div class="phone" data-frame-kind="phone">
        <div class="screen" style="width: {media.w}px; height: {media.h}px;">
            {@render children()}
            <div class="side" aria-hidden="true"><Heart /><MessageCircle /><Send /></div>
        </div>
    </div>
{:else if frame === "post"}
    <div class="post" style="width: {media.w + 26}px;" data-frame-kind="post">
        <div class="post-head" aria-hidden="true">
            <span class="avatar"></span><span class="lines"><i></i><i class="short"></i></span><Ellipsis />
        </div>
        <div class="media" style="width: {media.w}px; height: {media.h}px;">{@render children()}</div>
        <div class="post-foot" aria-hidden="true"><Heart /><MessageCircle /><Send /></div>
    </div>
{:else if frame === "player"}
    <div class="player" style="width: {media.w + 20}px;" data-frame-kind="player">
        <div style="width: {media.w}px; height: {media.h}px;">{@render children()}</div>
        <div class="scrub" aria-hidden="true">
            <Play />
            <span class="bar"><i style="width: {Math.min(100, played * 100)}%"></i></span>
            <span class="tabular-nums">{clock}</span>
        </div>
    </div>
{:else}
    <div class="chat" data-frame-kind="chat">
        <span class="avatar"></span>
        <div>
            <p class="who" aria-hidden="true">
                <b>{t("dispatch.share.chat_you")}</b><span>{t("dispatch.share.chat_today")}</span>
            </p>
            <div class="media" style="width: {media.w}px; height: {media.h}px;">{@render children()}</div>
        </div>
    </div>
{/if}

<style>
    .phone {
        padding: 14px;
        border-radius: 42px;
        background: #0b0b0c;
        box-shadow:
            inset 0 0 0 2px #2c2c30,
            0 24px 60px -18px rgb(0 0 0 / 0.7);
    }

    .screen {
        position: relative;
        overflow: hidden;
        border-radius: 28px;
    }

    .side {
        position: absolute;
        right: 10px;
        bottom: 18%;
        display: flex;
        flex-direction: column;
        gap: 14px;
        color: white;
        filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.8));
    }

    .side :global(svg) {
        width: 22px;
    }

    .post,
    .chat {
        border-radius: 14px;
        background: var(--card);
        border: 1px solid var(--border);
        box-shadow: 0 24px 60px -18px rgb(0 0 0 / 0.6);
    }

    .post {
        padding: 0 12px;
    }

    .post-head,
    .post-foot {
        display: flex;
        align-items: center;
        gap: 10px;
        height: 56px;
        color: var(--muted-foreground);
    }

    .post-head :global(svg),
    .post-foot :global(svg) {
        width: 20px;
    }

    .post-foot {
        gap: 16px;
        height: 54px;
    }

    .media {
        overflow: hidden;
        border-radius: 4px;
    }

    .avatar {
        flex: none;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 40%, black));
    }

    .lines {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 6px;
    }

    .lines i {
        display: block;
        width: 40%;
        height: 7px;
        border-radius: 4px;
        background: var(--muted);
    }

    .lines i.short {
        width: 24%;
    }

    .player {
        padding: 10px 10px 0;
        border-radius: 10px;
        background: #0b0b0c;
        box-shadow: 0 24px 60px -18px rgb(0 0 0 / 0.7);
    }

    .scrub {
        display: flex;
        align-items: center;
        gap: 12px;
        height: 48px;
        padding: 0 4px;
        color: #ddd;
        font-size: 12px;
    }

    .scrub :global(svg) {
        width: 18px;
    }

    .bar {
        flex: 1;
        height: 4px;
        border-radius: 2px;
        background: #333;
    }

    .bar i {
        display: block;
        height: 100%;
        border-radius: 2px;
        background: var(--primary);
    }

    .chat {
        display: flex;
        gap: 14px;
        padding: 14px 18px 18px;
    }

    .who {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin-bottom: 6px;
        font-size: 14px;
    }

    .who span {
        font-size: 11px;
        color: var(--muted-foreground);
    }
</style>
