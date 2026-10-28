import type { Storage } from "../src/batcher";

export class FakeStorage implements Storage {
    data = new Map<string, unknown>();
    alarm: number | null = null;

    async get<T>(key: string): Promise<T | undefined> {
        return structuredClone(this.data.get(key)) as T | undefined;
    }
    async put<T>(key: string, value: T): Promise<void> {
        this.data.set(key, structuredClone(value));
    }
    async delete(key: string): Promise<boolean> {
        return this.data.delete(key);
    }
    async list<T>(options: { prefix: string }): Promise<Map<string, T>> {
        const keys = [...this.data.keys()].filter((k) => k.startsWith(options.prefix)).sort();
        return new Map(keys.map((k) => [k, structuredClone(this.data.get(k)) as T]));
    }
    async getAlarm(): Promise<number | null> {
        return this.alarm;
    }
    async setAlarm(time: number): Promise<void> {
        this.alarm = time;
    }
    async deleteAlarm(): Promise<void> {
        this.alarm = null;
    }
}
