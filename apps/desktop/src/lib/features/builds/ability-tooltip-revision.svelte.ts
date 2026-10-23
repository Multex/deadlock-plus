let revision = $state(0);

/** Counts game updates whose ability tooltips have been read again; read in an effect, it re-runs that effect. */
export function abilityTooltipsRevision(): number {
    return revision;
}

export function bumpAbilityTooltipsRevision(): void {
    revision += 1;
}
