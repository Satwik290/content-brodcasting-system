import { Request, Response, NextFunction } from 'express';
import { ContentService } from '../services/content.service';
import { UploadService } from '../services/upload.service';
import { z } from 'zod';
import { AppError } from '../middlewares/errorHandler';
import { AuthRequest } from '../middlewares/auth';
import multer from 'multer';
import { uploadContentSchema, approvalSchema } from '../validators/content.validator';
import { logger } from '../utils/logger';

const upload = multer({ storage: multer.memoryStorage() });
export const uploadMiddleware = upload.single('file');

export class ContentController {
    static async uploadContent(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const file = req.file;

            if (!file) {
                logger.warn('Upload attempt without file', { userId: req.user?.id });
                return next(new AppError('No file provided', 400));
            }

            const validatedData = uploadContentSchema.parse(req.body);

            // Step 1: Save file
            const uploadResult = await UploadService.save(file, {
                title: validatedData.title,
                subject: validatedData.subject.toLowerCase()
            });

            // Step 2: Create content record via Service
            const content = await ContentService.createContent({
                title: validatedData.title,
                subject: validatedData.subject.toLowerCase(),
                description: validatedData.description,
                file_path: uploadResult.path,
                file_type: uploadResult.type,
                file_size: uploadResult.size,
                startTime: new Date(validatedData.startTime),
                endTime: new Date(validatedData.endTime),
                rotationDuration: validatedData.rotationDuration
            }, req.user!.id);

            logger.info('Content uploaded successfully', {
                contentId: content.id,
                teacherId: req.user?.id,
                fileName: file.originalname
            });

            res.status(201).json({
                success: true,
                data: content
            });

        } catch (error) {
            if (error instanceof z.ZodError) {
                return next(new AppError(error.issues[0].message, 400));
            }
            logger.error('Upload error', error);
            next(error);
        }
    }

    static async approve(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const contentId = req.params.id as string;

            const content = await ContentService.updateStatus(
                contentId,
                'APPROVED',
                req.user!.id
            );

            res.json({
                success: true,
                message: 'Content approved successfully',
                data: content
            });
        } catch (error) {
            next(error);
        }
    }

    static async reject(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const contentId = req.params.id as string;
            const validatedData = approvalSchema.parse({
                status: 'REJECTED',
                reason: req.body.reason
            });

            const content = await ContentService.updateStatus(
                contentId,
                'REJECTED',
                req.user!.id,
                validatedData.reason
            );

            res.json({
                success: true,
                data: content
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                return next(new AppError(error.issues[0].message, 400));
            }
            next(error);
        }
    }

    static async getMyUploads(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { status, subject, limit = '10', offset = '0' } = req.query;

            const result = await ContentService.getContentByTeacher(req.user!.id, {
                status: status as any,
                subject: subject as string | undefined,
                limit: parseInt(limit as string, 10),
                offset: parseInt(offset as string, 10)
            });

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    static async getPendingContent(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { limit = '20', offset = '0', subject } = req.query;

            const result = await ContentService.getPendingContent({
                subject: subject as string | undefined,
                limit: parseInt(limit as string, 10),
                offset: parseInt(offset as string, 10)
            });

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    static async listAllContent(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { limit = '20', offset = '0', subject, status } = req.query;

            const result = await ContentService.getAllContent({
                subject: subject as string | undefined,
                status: status as any,
                limit: parseInt(limit as string, 10),
                offset: parseInt(offset as string, 10)
            });

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }
}
