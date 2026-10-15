/** The slice of a KV namespace the transparency page and the bot use, so tests can pass a plain map. */
export interface Store {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<unknown>;
}
