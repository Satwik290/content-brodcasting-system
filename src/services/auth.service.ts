import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
import redis from '../config/redis';
import { AppError } from '../middlewares/errorHandler';
import { LoginResponse } from '../types/auth.types';
import { Role } from '@prisma/client';
import { UserModel } from '../models/user.model';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

export class AuthService {
    static async register(data: { name: string; email: string; password: string; role: Role }) {
        const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
        if (existingUser) {
            throw new AppError('Email already exists', 400);
        }

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(data.password, salt);

        const user = await prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                password_hash,
                role: data.role
            }
        });

        const token = this.generateToken(user.id, user.role);

        return {
            user: UserModel.sanitize(user),
            token
        };
    }

    static async login(email: string, password: string): Promise<LoginResponse> {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw new AppError('Invalid credentials', 401);
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            throw new AppError('Invalid credentials', 401);
        }

        const token = this.generateToken(user.id, user.role);

        return {
            token,
            role: user.role,
            user: UserModel.sanitize(user)
        };
    }

    private static generateToken(id: string, role: Role): string {
        return jwt.sign({ id, role }, JWT_SECRET, { expiresIn: '1h' });
    }

    static async logout(token: string) {
        try {
            const decoded = jwt.decode(token) as { exp: number };
            if (!decoded || !decoded.exp) return;

            const now = Math.floor(Date.now() / 1000);
            const remainingTime = decoded.exp - now;

            if (remainingTime > 0) {
                // Blocklist the token in Redis for its remaining life
                await redis.setex(`blocklist:${token}`, remainingTime, '1');
            }
        } catch (error) {
            // Silently fail if token is malformed
        }
    }
}
