import { Role } from '@prisma/client';

export interface LoginResponse {
    token: string;
    role: Role;
    user: {
        id: string;
        name: string;
        email: string;
    };
}

export interface AuthUser {
    id: string;
    role: Role;
}
