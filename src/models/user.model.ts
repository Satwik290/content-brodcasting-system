import { User, Role } from '@prisma/client';

export class UserModel {
    static sanitize(user: User) {
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt
        };
    }

    static isPrincipal(role: Role): boolean {
        return role === 'PRINCIPAL';
    }

    static isTeacher(role: Role): boolean {
        return role === 'TEACHER';
    }
}
