<script lang="ts">
    import { ClipboardPaste, LoaderCircle } from "@lucide/svelte";
    import { goto } from "$app/navigation";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Dialog from "@deadlock-plus/ui/dialog";
    import Textarea from "@deadlock-plus/ui/textarea.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { CodePaste } from "../../build-code.svelte";

    const FIELD_ID = "build-code-field";
    const ERROR_ID = "build-code-error";

    let open = $state(false);
    let paste = $state(new CodePaste());
    const importing = $derived(paste.status.kind === "importing");
    const failure = $derived(paste.status.kind === "failed" ? paste.status.message : null);

    function start() {
        paste = new CodePaste();
        open = true;
    }

    async function submit(e: SubmitEvent) {
        e.preventDefault();
        if (!paste.canSubmit) return;
        const href = await paste.submit();
        if (href === null) return;
        open = false;
        await goto(href);
    }
</script>

<Button variant="outline" size="sm" data-testid="paste-build-code" onclick={start}>
    <ClipboardPaste aria-hidden="true" />
    {t("builds.code.paste")}
</Button>

<Dialog.Root bind:open>
    <Dialog.Content class="max-w-md" data-testid="paste-build-code-dialog">
        <Dialog.Title>{t("builds.code.paste_title")}</Dialog.Title>
        <Dialog.Description class="text-sm text-muted-foreground">
            {t("builds.code.paste_description")}
        </Dialog.Description>
        <form class="flex flex-col gap-4" onsubmit={submit}>
            <div class="flex flex-col gap-1.5">
                <label class="text-xs text-muted-foreground" for={FIELD_ID}>{t("builds.code.paste_label")}</label>
                <Textarea
                    id={FIELD_ID}
                    rows={4}
                    class="resize-none font-mono text-xs break-all"
                    spellcheck={false}
                    autocomplete="off"
                    aria-invalid={failure !== null}
                    aria-describedby={failure ? ERROR_ID : undefined}
                    data-testid="build-code-field"
                    bind:value={() => paste.code, (next) => paste.edit(next)}
                />
                {#if failure}
                    <p id={ERROR_ID} role="alert" class="text-sm text-destructive">{failure}</p>
                {/if}
            </div>
            <div class="flex justify-end gap-2">
                <Button variant="outline" type="button" onclick={() => (open = false)}>
                    {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={!paste.canSubmit} data-testid="build-code-open">
                    {#if importing}
                        <LoaderCircle class="animate-spin" aria-hidden="true" />
                    {/if}
                    {t("builds.code.paste_submit")}
                </Button>
            </div>
        </form>
    </Dialog.Content>
</Dialog.Root>
