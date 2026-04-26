import redis from '../config/redis';
import { SchedulingService } from './scheduling.service';
import { singleFlight } from '../utils/singleFlight';
import { logger } from '../utils/logger';

export class BroadcastService {
    static async getLiveContent(teacherId: string, subject?: string) {
        const cacheKey = `live_content:${teacherId}:${subject || 'all'}`;

        // Step 1: Check Cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            logger.debug('Cache hit', { cacheKey });
            return { data: JSON.parse(cached), cached: true };
        }

        // Step 2: COLLAPSE concurrent requests (SingleFlight)
        const selectedData = await singleFlight.do(cacheKey, async () => {
            const now = new Date();
            const result = await SchedulingService.getActiveContent(teacherId, subject, now);

            if (result.content) {
                const publicData = {
                    teacherId,
                    content: {
                        id: result.content.id,
                        title: result.content.title,
                        subject: result.content.subject,
                        fileUrl: result.content.fileUrl,
                        uploadedAt: result.content.createdAt,
                        rotationInfo: result.rotationInfo,
                        isActive: true,
                        activeUntil: result.activeUntil
                    }
                };

                // TTL = remaining time in rotation
                const ttl = Math.max(1, Math.floor((result.activeUntil!.getTime() - now.getTime()) / 1000));
                await redis.setex(cacheKey, ttl, JSON.stringify(publicData));
                
                return publicData;
            }

            const emptyState = {
                content: null,
                message: result.message || "No content available"
            };

            await redis.setex(cacheKey, 60, JSON.stringify(emptyState));
            return emptyState;
        });

        // Step 3: Trigger Analytics (Async)
        if (selectedData.content) {
            this.trackView(selectedData.content.id, teacherId, selectedData.content.subject);
        }

        return { data: selectedData, cached: false };
    }

    private static trackView(contentId: string, teacherId: string, subject: string) {
        redis.xadd(
            'content_views_stream',
            '*',
            'content_id', contentId,
            'teacher_id', teacherId,
            'subject', subject,
            'timestamp', Date.now().toString()
        ).catch(err => logger.error('Analytics failed', err));
    }
}
