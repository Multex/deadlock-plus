const LIMIT = 200;

export class History<T> {
    #past: T[] = [];
    #future: T[] = [];
    #present: T;
    #lastKey: string | undefined;

    constructor(initial: T) {
        this.#present = initial;
    }

    get present(): T {
        return this.#present;
    }

    get canUndo(): boolean {
        return this.#past.length > 0;
    }

    get canRedo(): boolean {
        return this.#future.length > 0;
    }

    /** A push with the same `mergeKey` as the one before replaces it, so one gesture is one undo step. */
    push(next: T, mergeKey?: string): void {
        const merge = mergeKey !== undefined && mergeKey === this.#lastKey && this.#past.length > 0;
        if (!merge) {
            this.#past.push(this.#present);
            if (this.#past.length > LIMIT) this.#past.shift();
        }
        this.#present = next;
        this.#future = [];
        this.#lastKey = mergeKey;
    }

    /** Returns the present after the step; unchanged when there is nothing to undo. */
    undo(): T {
        if (this.#past.length === 0) return this.#present;
        const previous = this.#past.pop()!;
        this.#future.push(this.#present);
        this.#present = previous;
        this.#lastKey = undefined;
        return previous;
    }

    redo(): T {
        if (this.#future.length === 0) return this.#present;
        const next = this.#future.pop()!;
        this.#past.push(this.#present);
        this.#present = next;
        this.#lastKey = undefined;
        return next;
    }
}
