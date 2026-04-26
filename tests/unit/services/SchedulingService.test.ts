import { describe, it, expect, beforeEach } from '@jest/globals';
import { SchedulingService, ContentWithScheduleAndSlot } from '../../../src/services/scheduling.service';

describe('SchedulingService - Subject-Based Rotation', () => {
    let now: Date;

    const makeSchedule = (contentId: string, startMs: number, endMs: number, slotId?: string) => ({
        id: `s${contentId}`,
        contentId,
        slotId: slotId ?? null,
        startTime: new Date(startMs),
        endTime: new Date(endMs),
        rotationDurationMinutes: 5,
        createdAt: new Date(),
        updatedAt: new Date()
    });

    const makeSlot = (id: string, contentId: string, rotationOrder: number) => ({
        id,
        subject: 'maths',
        rotationOrder,
        contentId,
        createdAt: new Date(),
        updatedAt: new Date()
    });

    const makeContent = (id: string, rotOrder: number, startMs: number, endMs: number): ContentWithScheduleAndSlot => ({
        id,
        title: `Content ${id}`,
        subject: 'maths',
        status: 'APPROVED',
        description: null,
        fileUrl: 'url',
        fileType: 'jpg',
        fileSize: 100,
        rejectionReason: null,
        teacherId: 't1',
        approvedById: 'p1',
        approvedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        schedule: makeSchedule(id, startMs, endMs, `slot${id}`),
        slots: [makeSlot(`slot${id}`, id, rotOrder)]
    });

    beforeEach(() => {
        now = new Date('2026-04-26T10:00:00Z');
    });

    it('should return null when content list is empty', () => {
        const result = SchedulingService.calculateActiveContentByRotation([], now);
        expect(result.content).toBeNull();
        expect(result.message).toBe('No content available');
    });

    it('should return null when no content is within time window', () => {
        const past = makeContent('1', 0,
            now.getTime() - 3600000, // started 1h ago
            now.getTime() - 1000     // ended 1s ago
        );
        const result = SchedulingService.calculateActiveContentByRotation([past], now);
        expect(result.content).toBeNull();
    });

    it('should return single active content', () => {
        const content = makeContent('1', 0,
            now.getTime() - 1000,    // started 1s ago
            now.getTime() + 600000   // ends in 10 min
        );
        const result = SchedulingService.calculateActiveContentByRotation([content], now);
        expect(result.content?.id).toBe('1');
        expect(result.rotationInfo?.rotationOrder).toBe(0);
        expect(result.rotationInfo?.totalContents).toBe(1);
    });

    it('should serve Content A at T+0 (start of cycle)', () => {
        const c1 = makeContent('A', 0, now.getTime(), now.getTime() + 1800000);
        const c2 = makeContent('B', 1, now.getTime(), now.getTime() + 1800000);
        const result = SchedulingService.calculateActiveContentByRotation([c1, c2], now);
        expect(result.content?.id).toBe('A');
        expect(result.rotationInfo?.currentIndex).toBe(0);
    });

    it('should serve Content B at T+6 minutes (into second slot)', () => {
        const c1 = makeContent('A', 0, now.getTime(), now.getTime() + 1800000);
        const c2 = makeContent('B', 1, now.getTime(), now.getTime() + 1800000);
        const t6min = new Date(now.getTime() + 6 * 60 * 1000);
        const result = SchedulingService.calculateActiveContentByRotation([c1, c2], t6min);
        expect(result.content?.id).toBe('B');
        expect(result.rotationInfo?.currentIndex).toBe(1);
    });

    it('should loop back to Content A at T+11 minutes (second cycle)', () => {
        const c1 = makeContent('A', 0, now.getTime(), now.getTime() + 1800000);
        const c2 = makeContent('B', 1, now.getTime(), now.getTime() + 1800000);
        const t11min = new Date(now.getTime() + 11 * 60 * 1000);
        const result = SchedulingService.calculateActiveContentByRotation([c1, c2], t11min);
        expect(result.content?.id).toBe('A');
        expect(result.rotationInfo?.currentIndex).toBe(0);
    });

    it('should correctly rotate 3-item cycle', () => {
        const startMs = now.getTime();
        const endMs = now.getTime() + 3600000;
        const c1 = makeContent('A', 0, startMs, endMs);
        const c2 = makeContent('B', 1, startMs, endMs);
        const c3 = makeContent('C', 2, startMs, endMs);

        // T+0 → A, T+6 → B, T+11 → C, T+16 → A (cycle = 15 min)
        expect(SchedulingService.calculateActiveContentByRotation([c1, c2, c3], new Date(startMs)).content?.id).toBe('A');
        expect(SchedulingService.calculateActiveContentByRotation([c1, c2, c3], new Date(startMs + 6 * 60000)).content?.id).toBe('B');
        expect(SchedulingService.calculateActiveContentByRotation([c1, c2, c3], new Date(startMs + 11 * 60000)).content?.id).toBe('C');
        expect(SchedulingService.calculateActiveContentByRotation([c1, c2, c3], new Date(startMs + 16 * 60000)).content?.id).toBe('A');
    });

    it('should respect time window — return null after endTime', () => {
        const windowEnd = now.getTime() + 600000; // 10 min window
        const content = makeContent('1', 0, now.getTime() - 1000, windowEnd);
        const afterWindow = new Date(windowEnd + 1000);
        const result = SchedulingService.calculateActiveContentByRotation([content], afterWindow);
        expect(result.content).toBeNull();
    });

    it('should return remaining seconds in current slot', () => {
        const c1 = makeContent('A', 0, now.getTime(), now.getTime() + 1800000);
        const result = SchedulingService.calculateActiveContentByRotation([c1], now);
        expect(result.rotationInfo?.remainingSeconds).toBeGreaterThan(0);
        expect(result.rotationInfo?.remainingSeconds).toBeLessThanOrEqual(5 * 60);
    });
});
