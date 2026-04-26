import { Content, ContentSchedule } from '@prisma/client';
import prisma from '../config/prisma';

export type ContentWithSchedule = Content & { schedule: ContentSchedule | null };

export class SchedulingService {
    static calculateActiveContent(activeContents: ContentWithSchedule[], currentTime: Date) {
        if (activeContents.length === 0) {
            return { content: null, message: "No content available" };
        }

        // Filter valid contents that actually have a schedule
        const validContents = activeContents.filter(c => c.schedule);
        if (validContents.length === 0) {
            return { content: null, message: "No content available" };
        }

        // Edge case: Single content
        if (validContents.length === 1) {
            const content = validContents[0];
            const nextRotationTime = new Date(
                currentTime.getTime() + (content.schedule!.rotationDurationMinutes * 60 * 1000)
            );
            return {
                content,
                activeUntil: nextRotationTime,
                nextContent: content
            };
        }

        // Multiple contents: Apply rotation based on the first item's start time as the window start
        const windowStart = new Date(validContents[0].schedule!.startTime);
        const elapsedMs = Math.max(0, currentTime.getTime() - windowStart.getTime());
        
        // Sum of all rotation durations
        const totalCycleDuration = validContents.reduce((sum, c) => {
            return sum + (c.schedule!.rotationDurationMinutes * 60 * 1000);
        }, 0);

        if (totalCycleDuration === 0) {
            return { content: null, message: "Invalid schedule configurations" };
        }

        // Find current position in cycle
        const cyclePosition = elapsedMs % totalCycleDuration;
        
        let currentPosition = 0;
        let currentIndex = 0;

        for (let i = 0; i < validContents.length; i++) {
            const durationMs = validContents[i].schedule!.rotationDurationMinutes * 60 * 1000;
            const nextPosition = currentPosition + durationMs;
            
            if (cyclePosition < nextPosition) {
                currentIndex = i;
                break;
            }
            currentPosition = nextPosition;
        }

        const activeContent = validContents[currentIndex];
        const nextIndex = (currentIndex + 1) % validContents.length;
        const nextContent = validContents[nextIndex];

        // Calculate next rotation time
        const timeRemainingInCurrentSlot = (currentPosition + (activeContent.schedule!.rotationDurationMinutes * 60 * 1000)) - cyclePosition;
        const nextRotationTime = new Date(currentTime.getTime() + timeRemainingInCurrentSlot);

        return {
            content: activeContent,
            activeUntil: nextRotationTime,
            nextContent: nextContent,
            debugInfo: {
                totalContents: validContents.length,
                currentIndex,
                cyclePosition,
                totalCycleDuration
            }
        };
    }

    static async getActiveContent(teacherId: string | undefined, subject: string | undefined, currentTime: Date) {
        const activeContents = await prisma.content.findMany({
            where: {
                status: 'APPROVED',
                ...(subject ? { subject } : {}),
                ...(teacherId ? { teacherId } : {}),
                schedule: {
                    startTime: { lte: currentTime },
                    endTime: { gte: currentTime }
                }
            },
            include: { schedule: true },
            orderBy: { createdAt: 'asc' }
        }) as unknown as ContentWithSchedule[];

        return SchedulingService.calculateActiveContent(activeContents, currentTime);
    }
}
