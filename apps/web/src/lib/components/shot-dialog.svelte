<script lang="ts">
    import * as Dialog from "@deadlock-plus/ui/dialog";

    import ShotViewer from "./shot-viewer.svelte";

    type Props = {
        open: boolean;
        onOpenChange: (next: boolean) => void;
        src: string;
        detailSrc?: string;
        startOnDetail: boolean;
        label: string;
        onCloseAutoFocus: (e: Event) => void;
    };

    let { open, onOpenChange, src, detailSrc, startOnDetail, label, onCloseAutoFocus }: Props = $props();
</script>

<Dialog.Root bind:open={() => open, onOpenChange}>
    <!-- Edge to edge on a phone. `touch-none` on the whole viewer keeps the browser's own pinch zoom out of it. -->
    <Dialog.Content
        class="inset-0 h-auto max-h-none w-auto max-w-none translate-x-0 translate-y-0 touch-none gap-0 overflow-hidden rounded-none border-0 bg-chrome p-0 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] outline-none select-none lg:inset-8 lg:rounded-lg lg:border"
        {onCloseAutoFocus}
    >
        <ShotViewer {src} {detailSrc} {startOnDetail} {label} onclose={() => onOpenChange(false)} />
    </Dialog.Content>
</Dialog.Root>
