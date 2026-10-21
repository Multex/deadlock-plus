// The `@define`s of the game's `citadel_base_styles` that its tooltips and shop cards use, renamed to our own
// names. `tokens.css` declares the same values as `--game-*` custom properties.
export const gameColors = {
    offWhite: "#ffefd7",
    offBlack: "#10130d",
    silvered: "#c6c6c6",
    shard: "#99ffd6",
    courageLight: "#ffd18d",
    courageBright: "#ec9719",
    courage: "#9d620b",
    courageDark: "#7f540e",
    spiritLight: "#e7c8ff",
    spiritBright: "#ce90ff",
    spirit: "#8a55b3",
    spiritDark: "#613484",
    fortitudeLight: "#d3fc96",
    fortitudeBright: "#7bba1d",
    fortitude: "#649717",
    fortitudeDark: "#4c7113",
    armor: "#00ff99",
    tech: "#00ddff",
    brandGreen: "#5fe69e",
    deadlockGreen: "#69e799",
    deadlockGreenDarker: "#2b7047",
    enemy: "#ff410d",
    buildsDark: "#365b92",
} as const;

export type GameColor = keyof typeof gameColors;
