<script lang="ts">
    import { Tabs } from "bits-ui";
    import { cn } from "../utils";

    let { class: className, ...rest }: Tabs.ContentProps = $props();
</script>

<Tabs.Content class={cn("mt-4 focus-visible:outline-none", className)} {...rest} />
