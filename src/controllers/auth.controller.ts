import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AppError } from '../middlewares/errorHandler';
import { loginSchema, registerSchema } from '../validators/auth.validator';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

export class AuthController {
    static async login(req: Request, res: Response, next: NextFunction) {
        try {
            const { email, password } = loginSchema.parse(req.body);

            const user = await prisma.user.findUnique({ where: { email } });
            if (!user) {
                return next(new AppError('Invalid credentials', 401));
            }

            const isMatch = await bcrypt.compare(password, user.password_hash);
            if (!isMatch) {
                return next(new AppError('Invalid credentials', 401));
            }

            const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });

            res.json({ token, role: user.role });
        } catch (error) {
            if (error instanceof z.ZodError) {
                return next(new AppError((error as any).errors[0].message, 400));
            }
            next(error);
        }
    }

    static async register(req: Request, res: Response, next: NextFunction) {
        try {
            const { name, email, password, role } = registerSchema.parse(req.body);

            const existingUser = await prisma.user.findUnique({ where: { email } });
            if (existingUser) {
                return next(new AppError('Email already exists', 400));
            }

            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash(password, salt);

            const user = await prisma.user.create({
                data: {
                    name,
                    email,
                    password_hash,
                    role
                }
            });

            const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });

            res.status(201).json({
                success: true,
                data: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                },
                token
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                return next(new AppError((error as any).errors[0].message, 400));
            }
            next(error);
        }
    }
}
