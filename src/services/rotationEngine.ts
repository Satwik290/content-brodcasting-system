import { Content } from '@prisma/client';

/**
 * Deterministic Rotation Engine
 * Calculates the active content deterministically based on time.
 */
export const getActiveContentIndex = (contentSet: Content[], currentEpochMs: number): number => {
    const N = contentSet.length;
    if (N === 0) return -1; // Handled as 200 OK empty response

    // Assume all content have same duration for simplicity in this pure deterministic engine, 
    // or calculate based on the first item if needed. Let's use 5 minutes (300,000 ms) as default.
    // In a real scenario, this would be derived from the ContentSchedule relation.
    const D = 5 * 60 * 1000;
    
    // T_epoch could be a fixed point in time, e.g., start of the day or an arbitrary absolute epoch
    // For simplicity, let's say T_epoch is the start of current day.
    const startOfDay = new Date();
    startOfDay.setUTCHours(0,0,0,0);
    const T_epoch = startOfDay.getTime();

    const elapsed = Math.max(0, currentEpochMs - T_epoch);
    const index = Math.floor(elapsed / D) % N;
    
    return index;
};
