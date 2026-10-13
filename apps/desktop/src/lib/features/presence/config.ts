import type { PresenceConfig } from "@deadlock-plus/ipc-types/PresenceConfig";
import type { PresencePartialImage } from "@deadlock-plus/ipc-types/PresencePartialImage";
import type { PresencePartialSlot } from "@deadlock-plus/ipc-types/PresencePartialSlot";
import type { PresenceStateId } from "@deadlock-plus/ipc-types/PresenceStateId";
import type { PresenceVariantId } from "@deadlock-plus/ipc-types/PresenceVariantId";

export type Scope = { state: PresenceStateId; variant?: PresenceVariantId; heroId?: number };

type StateLayers = { [key in PresenceStateId]?: PresencePartialSlot };
type VariantLayers = { [key in PresenceStateId]?: { [key in PresenceVariantId]?: PresencePartialSlot } };

const IMAGE_FIELDS = ["largeImage", "smallImage"] as const;

function compactImage(image: PresencePartialImage | undefined): PresencePartialImage | undefined {
    if (!image) return undefined;
    const out: PresencePartialImage = {};
    if (image.enabled !== undefined) out.enabled = image.enabled;
    if (image.source !== undefined) out.source = image.source;
    return Object.keys(out).length ? out : undefined;
}

function compactSlot(slot: PresencePartialSlot): PresencePartialSlot | undefined {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(slot)) {
        if (value === undefined) continue;
        if ((IMAGE_FIELDS as readonly string[]).includes(key)) {
            const image = compactImage(value as PresencePartialImage);
            if (image) out[key] = image;
        } else {
            out[key] = value;
        }
    }
    return Object.keys(out).length ? (out as PresencePartialSlot) : undefined;
}

function mergeSlot(base: PresencePartialSlot, patch: PresencePartialSlot): PresencePartialSlot {
    const merged: PresencePartialSlot = { ...base };
    for (const [key, value] of Object.entries(patch)) {
        const field = key as keyof PresencePartialSlot;
        if ((IMAGE_FIELDS as readonly string[]).includes(key) && value) {
            const current = (base[field as (typeof IMAGE_FIELDS)[number]] ?? {}) as PresencePartialImage;
            const next: PresencePartialImage = { ...current };
            for (const [k, v] of Object.entries(value as PresencePartialImage)) {
                if (v === undefined) delete next[k as keyof PresencePartialImage];
                else (next as Record<string, unknown>)[k] = v;
            }
            (merged as Record<string, unknown>)[key] = next;
        } else if (value === undefined) {
            delete merged[field];
        } else {
            (merged as Record<string, unknown>)[key] = value;
        }
    }
    return merged;
}

function layers(config: PresenceConfig, heroId: number | undefined): { states: StateLayers; variants: VariantLayers } {
    if (heroId === undefined) return config;
    return config.heroes[heroId] ?? { states: {}, variants: {} };
}

export function getSlot(config: PresenceConfig, scope: Scope): PresencePartialSlot {
    const { states, variants } = layers(config, scope.heroId);
    if (scope.variant) return variants[scope.state]?.[scope.variant] ?? {};
    return states[scope.state] ?? {};
}

function withLayers(
    states: StateLayers,
    variants: VariantLayers,
    scope: Scope,
    slot: PresencePartialSlot | undefined,
): { states: StateLayers; variants: VariantLayers } {
    if (scope.variant) {
        const forState = { ...variants[scope.state] };
        if (slot) forState[scope.variant] = slot;
        else delete forState[scope.variant];
        const nextVariants = { ...variants };
        if (Object.keys(forState).length) nextVariants[scope.state] = forState;
        else delete nextVariants[scope.state];
        return { states, variants: nextVariants };
    }
    const nextStates = { ...states };
    if (slot) nextStates[scope.state] = slot;
    else delete nextStates[scope.state];
    return { states: nextStates, variants };
}

function putSlot(config: PresenceConfig, scope: Scope, slot: PresencePartialSlot | undefined): PresenceConfig {
    const compact = slot && compactSlot(slot);
    if (scope.heroId === undefined) {
        return { ...config, ...withLayers(config.states, config.variants, scope, compact) };
    }
    const hero = layers(config, scope.heroId);
    const next = withLayers(hero.states, hero.variants, scope, compact);
    const heroes = { ...config.heroes };
    if (Object.keys(next.states).length || Object.keys(next.variants).length) heroes[scope.heroId] = next;
    else delete heroes[scope.heroId];
    return { ...config, heroes };
}

export function setField(config: PresenceConfig, scope: Scope, patch: PresencePartialSlot): PresenceConfig {
    return putSlot(config, scope, mergeSlot(getSlot(config, scope), patch));
}

export function resetField(config: PresenceConfig, scope: Scope, field: keyof PresencePartialSlot): PresenceConfig {
    const next = { ...getSlot(config, scope) };
    delete next[field];
    return putSlot(config, scope, next);
}

export function resetScope(config: PresenceConfig, scope: Scope): PresenceConfig {
    return putSlot(config, scope, undefined);
}

export function isCustomised(config: PresenceConfig, scope: Scope): boolean {
    return compactSlot(getSlot(config, scope)) !== undefined;
}

export function effectiveSlot(config: PresenceConfig, defaults: PresenceConfig, scope: Scope): PresencePartialSlot {
    const { state, variant, heroId } = scope;
    const ordered: PresencePartialSlot[] = [];
    if (heroId !== undefined && variant) ordered.push(getSlot(config, { state, variant, heroId }));
    if (variant) ordered.push(getSlot(config, { state, variant }));
    if (heroId !== undefined) ordered.push(getSlot(config, { state, heroId }));
    ordered.push(getSlot(config, { state }));
    if (variant) ordered.push(getSlot(defaults, { state, variant }));
    ordered.push(getSlot(defaults, { state }));

    const out: PresencePartialSlot = {};
    for (const layer of [...ordered].reverse()) {
        for (const [key, value] of Object.entries(layer)) {
            if (value === undefined) continue;
            if ((IMAGE_FIELDS as readonly string[]).includes(key)) {
                const field = key as (typeof IMAGE_FIELDS)[number];
                out[field] = { ...out[field], ...compactImage(value as PresencePartialImage) };
            } else {
                (out as Record<string, unknown>)[key] = value;
            }
        }
    }
    return out;
}

export function isEnabled(config: PresenceConfig, defaults: PresenceConfig, scope: Scope): boolean {
    return effectiveSlot(config, defaults, scope).enabled ?? true;
}
