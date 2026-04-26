import { z } from 'zod';
import { Role } from '@prisma/client';

export const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});

export const registerSchema = z.object({
    name: z.string().min(1).max(255),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(['PRINCIPAL', 'TEACHER'])
});
