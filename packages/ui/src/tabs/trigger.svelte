<script lang="ts">
    import { Tabs } from "bits-ui";
    import { cn } from "../utils";

    let { class: className, ...rest }: Tabs.TriggerProps = $props();
</script>

<Tabs.Trigger
    class={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className,
    )}
    {...rest}
/>
