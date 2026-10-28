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
    /**
     * An opened spread (magazine pages, fold-out poster, inside spread) needs the whole room: the page then slides
     * the rack away and grows `stage`. Call it again with `false` when the object closes.
     */
    onexpand?: (expanded: boolean) => void;
}
