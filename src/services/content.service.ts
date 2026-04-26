import prisma from '../config/prisma';
import { Status } from '@prisma/client';
import { AppError } from '../middlewares/errorHandler';
import { logger } from '../utils/logger';
import { CreateContentDTO, ContentFilters } from '../types/content.types';

export class ContentService {
    /**
     * Creates content with schedule and rotation slot.
     * Content starts as UPLOADED then moves to PENDING (submitted for review).
     * Populates ContentSlot with rotation order, then links ContentSchedule to that slot.
     */
    static async createContent(data: CreateContentDTO, userId: string) {
        return await (prisma as any).$transaction(async (trx: any) => {
            // Step 1: Find max rotation order for this subject
            const maxSlot = await trx.contentSlot.findFirst({
                where: { subject: data.subject },
                orderBy: { rotationOrder: 'desc' },
                select: { rotationOrder: true }
            });

            const nextRotationOrder = (maxSlot?.rotationOrder ?? -1) + 1;

            // Step 2: Create Content (starts at UPLOADED per lifecycle: uploaded → pending)
            const content = await trx.content.create({
                data: {
                    title: data.title,
                    description: data.description,
                    subject: data.subject,
                    fileUrl: data.file_path,
                    fileType: data.file_type,
                    fileSize: data.file_size,
                    teacherId: userId,
                    status: 'UPLOADED',  // Lifecycle: uploaded → pending
                }
            });

            // Step 2.1: Transition to PENDING immediately (auto-submit)
            await trx.content.update({
                where: { id: content.id },
                data: { status: 'PENDING' }
            });

            // Step 3: Create ContentSlot for this subject's rotation
            const slot = await trx.contentSlot.create({
                data: {
                    subject: data.subject,
                    rotationOrder: nextRotationOrder,
                    contentId: content.id
                }
            });

            // Step 4: Create ContentSchedule linked to BOTH the Content AND the ContentSlot (spec requirement)
            const schedule = await trx.contentSchedule.create({
                data: {
                    contentId: content.id,
                    slotId: slot.id,       // ← slot_id FK per spec
                    startTime: data.startTime,
                    endTime: data.endTime,
                    rotationDurationMinutes: data.rotationDuration || 5
                }
            });

            logger.info('Content created with rotation slot', {
                contentId: content.id,
                teacherId: userId,
                subject: data.subject,
                rotationOrder: nextRotationOrder,
                slotId: slot.id
            });

            return { ...content, schedule, slots: [slot] };
        });
    }

    static async updateStatus(id: string, status: Status, principalId: string, rejectionReason?: string) {
        return await (prisma as any).$transaction(async (trx: any) => {
            const content = await trx.content.findUnique({
                where: { id },
                include: { slots: true }
            });
            
            if (!content) throw new AppError('Content not found', 404);

            // Immutability Check (Application Level — DB trigger is second line of defence)
            if (content.status === 'APPROVED') {
                throw new AppError('Cannot modify approved content', 409);
            }
            if (content.status !== 'PENDING') {
                throw new AppError('Content is not in pending state and cannot be reviewed', 400);
            }

            const updated = await trx.content.update({
                where: { id },
                data: { 
                    status, 
                    rejectionReason,
                    approvedById: status === 'APPROVED' ? principalId : null,
                    approvedAt: status === 'APPROVED' ? new Date() : null
                },
                include: { slots: true, schedule: true }
            });

            await trx.auditLog.create({
                data: {
                    userId: principalId,
                    action: status === 'APPROVED' ? 'approve' : 'reject',
                    entityType: 'content',
                    entityId: id,
                    changes: {
                        status,
                        rejectionReason,
                        rotationSlots: content.slots.length
                    }
                }
            });

            logger.info(`Content status updated to ${status}`, {
                contentId: id,
                principalId,
                rotationOrder: content.slots[0]?.rotationOrder
            });
            return updated;
        });
    }

    static async getPendingContent(filters: ContentFilters = {}) {
        const where = {
            status: 'PENDING' as Status,
            ...(filters.subject ? { subject: filters.subject } : {})
        };

        const [items, total] = await (prisma as any).$transaction([
            prisma.content.findMany({
                where,
                include: {
                    author: { select: { id: true, name: true } },
                    schedule: true,
                    slots: true
                } as any,
                orderBy: { createdAt: 'asc' },
                take: filters.limit || 20,
                skip: filters.offset || 0
            }),
            prisma.content.count({ where })
        ]);

        return { items, total };
    }

    static async getContentByTeacher(teacherId: string, filters: ContentFilters = {}) {
        const where = {
            teacherId,
            ...(filters.status ? { status: filters.status } : {}),
            ...(filters.subject ? { subject: filters.subject } : {})
        };

        const [items, total] = await (prisma as any).$transaction([
            prisma.content.findMany({
                where,
                include: { 
                    schedule: true,
                    slots: true
                } as any,
                orderBy: { createdAt: 'desc' },
                take: filters.limit || 20,
                skip: filters.offset || 0
            }),
            prisma.content.count({ where })
        ]);

        return { items, total };
    }

    static async getAllContent(filters: ContentFilters = {}) {
        const where = {
            ...(filters.status ? { status: filters.status } : {}),
            ...(filters.subject ? { subject: filters.subject } : {})
        };

        const [items, total] = await (prisma as any).$transaction([
            prisma.content.findMany({
                where,
                include: {
                    author: { select: { id: true, name: true } },
                    schedule: true,
                    slots: true
                } as any,
                orderBy: { createdAt: 'desc' },
                take: filters.limit || 20,
                skip: filters.offset || 0
            }),
            prisma.content.count({ where })
        ]);

        return { items, total };
    }
}
