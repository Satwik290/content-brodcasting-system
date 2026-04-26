import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middlewares/errorHandler';
import { loginSchema, registerSchema } from '../validators/auth.validator';
import { AuthService } from '../services/auth.service';

export class AuthController {
    static async login(req: Request, res: Response, next: NextFunction) {
        try {
            const { email, password } = loginSchema.parse(req.body);
            const result = await AuthService.login(email, password);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                return next(new AppError(error.issues[0].message, 400));
            }
            next(error);
        }
    }

    static async register(req: Request, res: Response, next: NextFunction) {
        try {
            const data = registerSchema.parse(req.body);
            const result = await AuthService.register(data);

            res.status(201).json({
                success: true,
                data: result
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                return next(new AppError(error.issues[0].message, 400));
            }
            next(error);
        }
    }

    static async logout(req: Request, res: Response, next: NextFunction) {
        try {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                await AuthService.logout(token);
            }

            res.json({
                success: true,
                message: 'Logged out successfully'
            });
        } catch (error) {
            next(error);
        }
    }
}
