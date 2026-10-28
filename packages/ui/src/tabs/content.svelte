<script lang="ts">
    import { Tabs } from "bits-ui";
    import { cn } from "../utils";

    let { class: className, ...rest }: Tabs.ContentProps = $props();
</script>

<!-- The panel is a tab stop, so it shows where focus is like every other stop. -->
<Tabs.Content
    class={cn(
        "mt-4 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid",
        className,
    )}
    {...rest}
/>
