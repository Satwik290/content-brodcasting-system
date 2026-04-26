import { Content, ContentSchedule } from '@prisma/client';
import prisma from '../config/prisma';
import { logger } from '../utils/logger';
import { RotationResult } from '../types/scheduling.types';

export type ContentWithScheduleAndSlot = Content & {
    schedule: ContentSchedule | null;
    slots: any[];
};

export class SchedulingService {
    /**
     * Determines active content based on rotation order within subject.
     */
    static calculateActiveContentByRotation(
        contentList: ContentWithScheduleAndSlot[],
        currentTime: Date
    ): RotationResult {
        if (contentList.length === 0) {
            return { content: null, message: "No content available" };
        }

        // Filter: Only approved, scheduled content in active time window
        const activeContents = contentList.filter(c => {
            if (c.status !== 'APPROVED') return false;
            if (!c.schedule) return false;
            
            const { startTime, endTime } = c.schedule;
            return currentTime >= startTime && currentTime <= endTime;
        });

        if (activeContents.length === 0) {
            return { content: null, message: "No content available" };
        }

        // Sort by rotation order (from ContentSlot)
        activeContents.sort((a, b) => {
            const aOrder = a.slots[0]?.rotationOrder ?? 999;
            const bOrder = b.slots[0]?.rotationOrder ?? 999;
            return aOrder - bOrder;
        });

        // Calculate rotation: which content is active NOW?
        const firstContent = activeContents[0];
        const firstSchedule = firstContent.schedule!;
        const cycleStartTime = new Date(firstSchedule.startTime);
        
        // Total cycle duration = sum of all content durations
        const totalCycleDurationMs = activeContents.reduce((sum, content) => {
            return sum + (content.schedule!.rotationDurationMinutes * 60 * 1000);
        }, 0);

        if (totalCycleDurationMs === 0) {
            return { content: null, message: "Invalid schedule configuration" };
        }

        // Current position in cycle
        const elapsedMs = Math.max(0, currentTime.getTime() - cycleStartTime.getTime());
        const positionInCycle = elapsedMs % totalCycleDurationMs;

        // Find which content is active
        let accumulatedTime = 0;
        let activeContentIndex = 0;
        let remainingTimeMs = totalCycleDurationMs;

        for (let i = 0; i < activeContents.length; i++) {
            const contentDurationMs = activeContents[i].schedule!.rotationDurationMinutes * 60 * 1000;
            
            if (positionInCycle < accumulatedTime + contentDurationMs) {
                activeContentIndex = i;
                remainingTimeMs = (accumulatedTime + contentDurationMs) - positionInCycle;
                break;
            }
            
            accumulatedTime += contentDurationMs;
        }

        const activeContent = activeContents[activeContentIndex];
        const nextRotationTime = new Date(currentTime.getTime() + remainingTimeMs);
        const nextIndex = (activeContentIndex + 1) % activeContents.length;
        const nextContent = activeContents[nextIndex];

        return {
            content: activeContent,
            activeUntil: nextRotationTime,
            nextContent,
            rotationInfo: {
                totalContents: activeContents.length,
                currentIndex: activeContentIndex,
                rotationOrder: activeContent.slots[0]?.rotationOrder ?? -1,
                remainingSeconds: Math.floor(remainingTimeMs / 1000)
            }
        };
    }

    /**
     * Main public method - query by teacher + subject
     */
    static async getActiveContent(teacherId: string | undefined, subject: string | undefined, currentTime: Date): Promise<RotationResult> {
        // Build WHERE clause
        const whereClause: any = {
            status: 'APPROVED'
        };

        if (teacherId) {
            whereClause.teacherId = teacherId;
        }
        if (subject) {
            whereClause.subject = subject;
        }

        // Query approved content in active time window
        const activeContents = await prisma.content.findMany({
            where: {
                ...whereClause,
                schedule: {
                    startTime: { lte: currentTime },
                    endTime: { gte: currentTime }
                }
            },
            include: {
                schedule: true,
                slots: true
            } as any
        }) as unknown as ContentWithScheduleAndSlot[];

        return SchedulingService.calculateActiveContentByRotation(activeContents, currentTime);
    }
}
