import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { AnalyticsService } from '../services/analytics.service';

export class AnalyticsController {
    static async getSystemStats(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const subjectStats = await AnalyticsService.getSubjectUsage();
            const topContent = await AnalyticsService.getContentStats();

            res.json({
                success: true,
                data: {
                    bySubject: subjectStats,
                    topContent: topContent
                }
            });
        } catch (error) {
            next(error);
        }
    }
}
