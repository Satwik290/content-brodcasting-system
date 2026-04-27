export class SingleFlight {
    private activeCalls: Map<string, Promise<any>> = new Map();


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
