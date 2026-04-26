import { z } from 'zod';

export const contentSchema = z.object({
    title: z.string().min(1),
    subject: z.string().min(1),
    file_url: z.string().url().optional(), // File is handled by multer, this might not be needed in body if upload is separate, but we keep it optional just in case
    duration: z.number().int().min(1).default(300),
    start_time: z.string().datetime(),
    end_time: z.string().datetime(),
});

export const approvalSchema = z.object({
    status: z.enum(['APPROVED', 'REJECTED']),
    rejection_reason: z.string().optional(),
}).refine(data => {
    if (data.status === 'REJECTED' && !data.rejection_reason) return false;
    return true;
}, { message: "Rejection requires a reason" });
