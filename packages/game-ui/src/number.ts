const view = new DataView(new ArrayBuffer(8));

/** A finite double as `mantissa * 2^exponent`, both exact. */
function binaryParts(value: number): { mantissa: bigint; exponent: number } {
    view.setFloat64(0, Math.abs(value));
    const high = view.getUint32(0);
    const low = view.getUint32(4);
    const biased = high >>> 20;
    const fraction = (BigInt(high & 0xfffff) << 32n) | BigInt(low);
    return biased === 0
        ? { mantissa: fraction, exponent: -1074 }
        : { mantissa: fraction | (1n << 52n), exponent: biased - 1075 };
}

/** `value` rounded to `decimals` digits as a scaled integer, ties to even on the stored binary value. */
function scaledHalfEven(value: number, decimals: number): bigint {
    const { mantissa, exponent } = binaryParts(value);
    const scaled = mantissa * 10n ** BigInt(decimals);
    if (exponent >= 0) return scaled << BigInt(exponent);
    const denominator = 1n << BigInt(-exponent);
    let quotient = scaled / denominator;
    const twice = (scaled % denominator) * 2n;
    if (twice > denominator || (twice === denominator && quotient % 2n === 1n)) quotient += 1n;
    return quotient;
}

function digitsOf(value: number, decimals: number): string {
    const digits = scaledHalfEven(value, decimals)
        .toString()
        .padStart(decimals + 1, "0");
    const whole = digits.slice(0, digits.length - decimals);
    const fraction = digits.slice(digits.length - decimals).replace(/0+$/, "");
    const unsigned = fraction ? `${whole}.${fraction}` : whole;
    return value < 0 && /[1-9]/.test(unsigned) ? `-${unsigned}` : unsigned;
}

/**
 * Rounds the way the game's tooltips print numbers: to the nearest, an exact tie to the even digit, judged on the
 * stored binary value (4.25 -> 4.2, 1.75 -> 1.8, 58.5 -> 58, while 1.15 is stored below the tie -> 1.1).
 */
export function roundHalfEven(value: number, decimals: number): number {
    if (!Number.isFinite(value)) return value;
    return Number(digitsOf(value, decimals));
}

/** {@link roundHalfEven} as the game prints it: plain digits, no grouping, trailing zeros trimmed. */
export function formatShownNumber(value: number, decimals: number): string {
    if (!Number.isFinite(value)) return String(value);
    return digitsOf(value, decimals);
}

// Damage reads as a whole number in game (Lightning Ball's 58.5 bonus DPS shows as 58) while other values keep
// one decimal (its 4.25m radius shows as 4.2m).
const WHOLE_CLASSES = new Set(["tech_damage", "bullet_damage"]);

/** The decimals the game shows for a property by its css class. */
export function shownDecimals(cssClass: string | null): number {
    return cssClass !== null && WHOLE_CLASSES.has(cssClass) ? 0 : 1;
}

/** Scaling factors such as Spirit Burn's `x 0.06`. */
export const FACTOR_DECIMALS = 2;
