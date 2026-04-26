import prisma from '../config/prisma';
import { PrismaClient, Status } from '@prisma/client';
import { AppError } from '../middlewares/errorHandler';
import { logger } from '../utils/logger';

type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;


export class ContentService {
    static async createContent(data: any, userId: string) {
        // Create content and schedule inside a transaction
        try {
            return await prisma.$transaction(async (trx) => {
                const content = await trx.content.create({
                    data: {
                        title: data.title,
                        description: data.description,
                        subject: data.subject,
                        fileUrl: data.file_path,
                        fileType: data.file_type,
                        fileSize: data.file_size,
                        teacherId: userId,
                        status: 'PENDING',
                        schedule: {
                            create: {
                                startTime: data.startTime,
                                endTime: data.endTime,
                                rotationDurationMinutes: data.rotationDuration || 5
                            }
                        }
                    },
                    include: { schedule: true }
                });

                logger.info('Content created', { contentId: content.id, teacherId: userId });
                return content;
            });
        } catch (error) {
            logger.error('Content creation failed', { error, userId });
            throw error;
        }
    }

    static async updateStatus(id: string, status: Status, principalId: string, rejectionReason?: string) {
        return await (prisma as any).$transaction(async (trx: any) => {
            const content = await trx.content.findUnique({ where: { id } });
            
            if (!content) throw new AppError('Content not found', 404);

            // Immutability Check
            if (content.status === 'APPROVED') {
                throw new AppError('Cannot modify approved content', 409);
            }
            if (content.status !== 'PENDING') {
                throw new AppError('Content not in pending state', 400);
            }

            const updated = await trx.content.update({
                where: { id },
                data: { 
                    status, 
                    rejectionReason,
                    approvedById: status === 'APPROVED' ? principalId : null,
                    approvedAt: status === 'APPROVED' ? new Date() : null
                }
            });

            await trx.auditLog.create({
                data: {
                    userId: principalId,
                    action: status === 'APPROVED' ? 'approve' : 'reject',
                    entityType: 'content',
                    entityId: id,
                    changes: { status, rejectionReason }
                }
            });

            logger.info(`Content status updated to ${status}`, { contentId: id, principalId });
            return updated;
        });
    }

    static async getPendingContent(filters: { subject?: string, limit?: number, offset?: number } = {}) {
        const where = {
            status: 'PENDING' as Status,
            ...(filters.subject ? { subject: filters.subject } : {})
        };

        const [items, total] = await prisma.$transaction([
            prisma.content.findMany({
                where,
                include: {
                    author: { select: { id: true, name: true } },
                    schedule: true
                },
                orderBy: { createdAt: 'asc' },
                take: filters.limit || 20,
                skip: filters.offset || 0
            }),
            prisma.content.count({ where })
        ]);

        return { items, total };
    }

    static async getContentByTeacher(teacherId: string, filters: { status?: Status, subject?: string, limit?: number, offset?: number } = {}) {
        const where = {
            teacherId,
            ...(filters.status ? { status: filters.status } : {}),
            ...(filters.subject ? { subject: filters.subject } : {})
        };

        const [items, total] = await prisma.$transaction([
            prisma.content.findMany({
                where,
                include: { schedule: true },
                orderBy: { createdAt: 'desc' },
                take: filters.limit || 20,
                skip: filters.offset || 0
            }),
            prisma.content.count({ where })
        ]);

        return { items, total };
    }
}
