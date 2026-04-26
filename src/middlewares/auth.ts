import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { AppError } from './errorHandler';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

export interface AuthRequest extends Request {
    user?: { id: string; role: Role };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(new AppError('Not authorized, no token provided', 401));
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role: Role };
        req.user = decoded;
        next();
    } catch (error) {
        next(new AppError('Not authorized, invalid token', 401));
    }
};

export const roleGuard = (requiredRoles: Role[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return next(new AppError('Not authenticated', 401));
        }

        if (!requiredRoles.includes(req.user.role)) {
            return next(new AppError('Forbidden: insufficient permissions', 403));
        }

        next();
    };
};
