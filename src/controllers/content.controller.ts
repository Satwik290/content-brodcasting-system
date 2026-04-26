import { Request, Response, NextFunction } from 'express';
import { ContentService } from '../services/content.service';
import { UploadService } from '../services/upload.service';
import { z } from 'zod';
import { AppError } from '../middlewares/errorHandler';
import { AuthRequest } from '../middlewares/auth';
import multer from 'multer';
import { approvalSchema } from '../validators/content.validator';
import { VALID_SUBJECTS } from '../config/constants';

// Multer in-memory setup so UploadService can process it
const upload = multer({ storage: multer.memoryStorage() });

export const uploadMiddleware = upload.single('file');

export class ContentController {
    static async uploadContent(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { title, subject, description, startTime, endTime, rotationDuration } = req.body;
            const file = req.file;

            if (!file) {
                return next(new AppError('No file provided', 400));
            }

            if (!title || !subject || !startTime || !endTime) {
                return next(new AppError('Missing required metadata', 400));
            }

            if (!VALID_SUBJECTS.includes(subject.toLowerCase())) {
                return next(new AppError(`Invalid subject. Must be one of: ${VALID_SUBJECTS.join(', ')}`, 400));
            }

            if (new Date(startTime) >= new Date(endTime)) {
                return next(new AppError('Start time must be before end time', 400));
            }

            // Save file
            const uploadResult = await UploadService.save(file, { title, subject });

            // Create record
            const content = await ContentService.createContent({
                title,
                subject,
                description,
                file_path: uploadResult.path,
                file_type: uploadResult.type,
                file_size: uploadResult.size,
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                rotationDuration: rotationDuration ? parseInt(rotationDuration, 10) : 5
            }, req.user!.id);

            res.status(201).json({ success: true, data: content });
        } catch (error) {
            next(error);
        }
    }

    static async approve(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const content = await ContentService.updateStatus(req.params.id as string, 'APPROVED', req.user!.id);
            res.json({ success: true, message: 'Content approved successfully', data: content });
        } catch (error) {
            next(error);
        }
    }

    static async reject(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { reason } = req.body;
            if (!reason || reason.length > 500) {
                return next(new AppError('Rejection reason must be between 1 and 500 characters', 400));
            }
            const content = await ContentService.updateStatus(req.params.id as string, 'REJECTED', req.user!.id, reason);
            res.json({ success: true, data: content });
        } catch (error) {
            next(error);
        }
    }

    static async getMyUploads(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { status, subject, limit = 10, offset = 0 } = req.query;
            const result = await ContentService.getContentByTeacher(req.user!.id, {
                status: status as any,
                subject: subject as string | undefined,
                limit: limit ? parseInt(limit as string, 10) : undefined,
                offset: offset ? parseInt(offset as string, 10) : undefined
            });
            res.json({
                success: true,
                data: {
                    total: result.total,
                    limit: limit ? parseInt(limit as string, 10) : 10,
                    offset: offset ? parseInt(offset as string, 10) : 0,
                    items: result.items
                }
            });
        } catch (error) {
            next(error);
        }
    }

    static async getPendingContent(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { limit = 20, offset = 0, subject } = req.query;
            const result = await ContentService.getPendingContent({
                subject: subject as string | undefined,
                limit: limit ? parseInt(limit as string, 10) : undefined,
                offset: offset ? parseInt(offset as string, 10) : undefined
            });
            res.json({
                success: true,
                data: {
                    total: result.total,
                    limit: limit ? parseInt(limit as string, 10) : 20,
                    offset: offset ? parseInt(offset as string, 10) : 0,
                    items: result.items
                }
            });
        } catch (error) {
            next(error);
        }
    }
}
