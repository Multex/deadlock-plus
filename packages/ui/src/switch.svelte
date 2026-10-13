<script lang="ts">
    import { Switch } from "bits-ui";
    import { cn } from "./utils";

    type Props = Switch.RootProps & {
        class?: string;
    };

    let { checked = $bindable(false), class: className, ...rest }: Props = $props();
</script>

<Switch.Root
    bind:checked
    class={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-success data-[state=unchecked]:bg-input",
        className,
    )}
    {...rest}
>
    <Switch.Thumb
        class="pointer-events-none block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
    />
</Switch.Root>
