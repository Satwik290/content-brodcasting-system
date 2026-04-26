import { describe, it, expect } from '@jest/globals';
import { SchedulingService, ContentWithSchedule } from '../../../services/scheduling.service';
import { Content, ContentSchedule } from '@prisma/client';

describe('SchedulingService (ADR-002 Pure Function)', () => {
    it('should return null when no contents are active', () => {
        const result = SchedulingService.calculateActiveContent([], new Date());
        expect(result.content).toBeNull();
    });

    it('should return the only content if only one is active', () => {
        const now = new Date();
        const content: ContentWithSchedule = {
            id: '1', title: 'Math 101', subject: 'maths', status: 'APPROVED',
            schedule: { id: 's1', rotationDurationMinutes: 5, startTime: new Date(now.getTime() - 10000), endTime: new Date(now.getTime() + 10000), contentId: '1', createdAt: now, updatedAt: now },
            createdAt: now, updatedAt: now, description: null, fileUrl: 'url', fileType: 'mp4', fileSize: 100, rejectionReason: null, approvedAt: now, teacherId: 't1', approvedById: 'p1'
        };

        const result = SchedulingService.calculateActiveContent([content], now);
        expect(result.content).toEqual(content);
        expect(result.activeUntil).toBeInstanceOf(Date);
    });

    it('should rotate deterministic based on start time', () => {
        const now = new Date('2026-04-26T10:00:00Z');
        const content1: ContentWithSchedule = {
            id: '1', title: 'A', subject: 'maths', status: 'APPROVED',
            schedule: { id: 's1', rotationDurationMinutes: 5, startTime: now, endTime: new Date(now.getTime() + 1000000), contentId: '1', createdAt: now, updatedAt: now },
            createdAt: now, updatedAt: now, description: null, fileUrl: 'url', fileType: 'mp4', fileSize: 100, rejectionReason: null, approvedAt: now, teacherId: 't1', approvedById: 'p1'
        };
        const content2: ContentWithSchedule = {
            id: '2', title: 'B', subject: 'maths', status: 'APPROVED',
            schedule: { id: 's2', rotationDurationMinutes: 5, startTime: now, endTime: new Date(now.getTime() + 1000000), contentId: '2', createdAt: now, updatedAt: now },
            createdAt: now, updatedAt: now, description: null, fileUrl: 'url', fileType: 'mp4', fileSize: 100, rejectionReason: null, approvedAt: now, teacherId: 't1', approvedById: 'p1'
        };

        // At T=0, Content 1 should be active
        let result = SchedulingService.calculateActiveContent([content1, content2], now);
        expect(result.content!.id).toBe('1');

        // At T=6min, Content 2 should be active
        const t6 = new Date(now.getTime() + 6 * 60 * 1000);
        result = SchedulingService.calculateActiveContent([content1, content2], t6);
        expect(result.content!.id).toBe('2');

        // At T=11min, Content 1 should be active again
        const t11 = new Date(now.getTime() + 11 * 60 * 1000);
        result = SchedulingService.calculateActiveContent([content1, content2], t11);
        expect(result.content!.id).toBe('1');
    });
});
