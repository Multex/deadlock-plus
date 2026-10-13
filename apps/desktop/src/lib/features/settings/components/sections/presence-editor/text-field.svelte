<script lang="ts">
    import Input from "@deadlock-plus/ui/input.svelte";
    import FieldFrame from "./field-frame.svelte";

    let {
        id,
        label,
        value,
        custom,
        onchange,
        onreset,
        onfocus,
    }: {
        id: string;
        label: string;
        value: string;
        custom: boolean;
        onchange: (value: string) => void;
        onreset: () => void;
        onfocus: () => void;
    } = $props();
</script>

<FieldFrame {id} {label} {custom} {onreset}>
    <Input {id} {value} maxlength={128} oninput={(e) => onchange(e.currentTarget.value)} {onfocus} />
</FieldFrame>
