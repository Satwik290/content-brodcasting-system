/**
 * Single-Flight Request Collapsing Utility
 * Prevents Thundering Herd problems during cache misses.
 */
export class SingleFlight {
    private activeCalls: Map<string, Promise<any>> = new Map();

    /**
     * Executes the given asynchronous function. If another call with the same key
     * is already running, returns the existing promise instead of running it again.
     */
    async do<T>(key: string, fn: () => Promise<T>): Promise<T> {
        if (this.activeCalls.has(key)) {
            // Wait for the existing call to finish
            return this.activeCalls.get(key) as Promise<T>;
        }

        const promise = fn().finally(() => {
            // Cleanup the map once the promise settles
            this.activeCalls.delete(key);
        });

        this.activeCalls.set(key, promise);
        return promise;
    }
}

export const singleFlight = new SingleFlight();
