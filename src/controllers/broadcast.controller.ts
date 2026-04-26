import { Request, Response, NextFunction } from 'express';
import { BroadcastService } from '../services/broadcast.service';
import { VALID_SUBJECTS } from '../config/constants';
import { logger } from '../utils/logger';

export class BroadcastController {
    static async getLiveContent(req: Request, res: Response, next: NextFunction) {
        try {
            const subject = (req.query.subject as string) || undefined;
            const teacherId = req.params.teacherId as string;

            // 1. Validation
            if (subject && !VALID_SUBJECTS.includes(subject.toLowerCase())) {
                return res.json({
                    success: true,
                    data: { content: null, message: "No content available" }
                });
            }

            if (!teacherId) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'invalid_teacher_id', message: 'Teacher ID required' }
                });
            }

            // 2. Delegate to Service
            const { data, cached } = await BroadcastService.getLiveContent(teacherId, subject);

            // 3. Response
            res.json({
                success: true,
                data,
                cached
            });

        } catch (error) {
            logger.error('Broadcast endpoint error', error);
            next(error);
        }
    }
}
