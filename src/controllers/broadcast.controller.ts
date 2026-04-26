import { Request, Response, NextFunction } from 'express';
import redis from '../config/redis';
import prisma from '../config/prisma';
import { SchedulingService, ContentWithSchedule } from '../services/scheduling.service';
import { singleFlight } from '../utils/singleFlight';

export class BroadcastController {
    static async getLiveContent(req: Request, res: Response, next: NextFunction) {
        try {
            const subject = (req.query.subject as string) || undefined;
            const teacherId = (req.params.teacherId as string) || undefined; // Optional if we want to filter by teacher as well
            
            // Build cache key based on params
            const cacheKey = `live_content:${teacherId || 'all'}:${subject || 'all'}`;

            // Check Cache
            const cached = await redis.get(cacheKey);
            if (cached) {
                return res.json({ success: true, data: JSON.parse(cached), cached: true });
            }

            // Single-Flight Request Collapsing: Prevents DB Thundering Herd
            const selectedData = await singleFlight.do(cacheKey, async () => {
                const now = new Date();
                
                const result = await SchedulingService.getActiveContent(teacherId, subject, now);
                
                if (result.content) {
                    const publicData = {
                        teacherId: result.content.teacherId,
                        content: {
                            id: result.content.id,
                            title: result.content.title,
                            subject: result.content.subject,
                            fileUrl: result.content.fileUrl,
                            uploadedAt: result.content.createdAt,
                            isActive: true,
                            activeUntil: result.activeUntil
                        }
                    };

                    // TTL based on active slot remainder (in seconds)
                    const ttl = Math.max(1, Math.floor((result.activeUntil!.getTime() - now.getTime()) / 1000));
                    await redis.setex(cacheKey, ttl, JSON.stringify(publicData));
                    return publicData;
                }
                
                // Cache the empty state briefly
                const emptyState = { content: null, message: result.message || "No content available" };
                await redis.setex(cacheKey, 60, JSON.stringify(emptyState)); 
                return emptyState;
            });

            // Async Analytics via Redis Stream (Only if content is served)
            if (selectedData.content) {
                await redis.xadd('content_views_stream', '*', 'content_id', selectedData.content.id, 'timestamp', Date.now().toString());
            }

            res.json({ success: true, data: selectedData });
        } catch (error) {
            next(error);
        }
    }
}
