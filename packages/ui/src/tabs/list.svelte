<script lang="ts">
    import { Tabs } from "bits-ui";
    import { cn } from "../utils";

    let { class: className, ...rest }: Tabs.ListProps = $props();
</script>

<Tabs.List
    class={cn("inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground", className)}
    {...rest}
/>
