import prisma from '../config/prisma';
import { AppError } from '../middlewares/errorHandler';
import { UserModel } from '../models/user.model';

export class UserService {
    static async getProfile(userId: string) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new AppError('User not found', 404);
        return UserModel.sanitize(user);
    }

    static async getTeachers() {
        const teachers = await prisma.user.findMany({ where: { role: 'TEACHER' } });
        return teachers.map(UserModel.sanitize);
    }
}
