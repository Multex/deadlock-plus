import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import type { EditionView } from "../edition-view";

/** What every edition object gets: it fits itself inside `stage` and plays its arrival when `reveal` is set. */
export interface EditionObjectProps {
    edition: Edition;
    view: EditionView;
    stage: { width: number; height: number };
    /** First view of an issued edition: play the kind's arrival; otherwise show it at rest. */
    reveal: boolean;
    onrevealed?: () => void;
}
