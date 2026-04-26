import prisma from '../config/prisma';

export class AnalyticsService {
    static async getSubjectUsage() {
        const stats = await (prisma as any).analytics.groupBy({
            by: ['subject'],
            _sum: {
                viewCount: true
            },
            orderBy: {
                _sum: {
                    viewCount: 'desc'
                }
            }
        });

        return stats.map((s: any) => ({
            subject: s.subject,
            totalViews: s._sum.viewCount || 0
        }));
    }

    static async getContentStats(limit = 10) {
        const stats = await (prisma as any).analytics.groupBy({
            by: ['contentId'],
            _sum: {
                viewCount: true
            },
            orderBy: {
                _sum: {
                    viewCount: 'desc'
                }
            },
            take: limit
        });

        // Hydrate with content titles
        const contentIds = stats.map((s: any) => s.contentId);
        const contents = await prisma.content.findMany({
            where: { id: { in: contentIds } },
            select: { id: true, title: true, subject: true }
        });

        const contentMap = contents.reduce((acc: any, c) => {
            acc[c.id] = c;
            return acc;
        }, {});

        return stats.map((s: any) => ({
            contentId: s.contentId,
            title: contentMap[s.contentId]?.title || 'Deleted Content',
            subject: contentMap[s.contentId]?.subject || 'unknown',
            totalViews: s._sum.viewCount || 0
        }));
    }
}
