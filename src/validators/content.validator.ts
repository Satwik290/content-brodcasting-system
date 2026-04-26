import { z } from 'zod';
import { VALID_SUBJECTS } from '../config/constants';

export const uploadContentSchema = z.object({
    title: z.string()
        .min(1, "Title is required")
        .max(255, "Title must be less than 255 characters")
        .trim(),
    
    subject: z.enum(VALID_SUBJECTS as [string, ...string[]])
        .refine(
            (val) => VALID_SUBJECTS.includes(val.toLowerCase()),
            "Invalid subject"
        ),
    
    description: z.string()
        .max(1000, "Description must be less than 1000 characters")
        .optional(),
    
    startTime: z.string()
        .datetime({ message: "Invalid ISO 8601 datetime format" }),
    
    endTime: z.string()
        .datetime({ message: "Invalid ISO 8601 datetime format" }),
    
    rotationDuration: z.coerce.number()
        .int("Duration must be an integer")
        .positive("Duration must be positive")
        .default(5)
}).refine(
    (data) => {
        const start = new Date(data.startTime);
        const end = new Date(data.endTime);
        return start < end;
    },
    {
        message: "Start time must be before end time",
        path: ["startTime"]
    }
);

export const approvalSchema = z.object({
    status: z.enum(['APPROVED', 'REJECTED']),
    reason: z.string()
        .min(5, "Rejection reason must be at least 5 characters")
        .max(500, "Rejection reason must be less than 500 characters")
        .optional()
}).refine(
    (data) => !(data.status === 'REJECTED' && !data.reason),
    {
        message: "Rejection requires a reason",
        path: ["reason"]
    }
);

export type UploadContentInput = z.infer<typeof uploadContentSchema>;
export type ApprovalInput = z.infer<typeof approvalSchema>;
