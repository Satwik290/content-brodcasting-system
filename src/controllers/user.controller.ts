import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { UserService } from '../services/user.service';

export class UserController {
    static async getMe(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const user = await UserService.getProfile(req.user!.id);
            res.json({
                success: true,
                data: user
            });
        } catch (error) {
            next(error);
        }
    }

    static async listTeachers(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const teachers = await UserService.getTeachers();
            res.json({
                success: true,
                data: teachers
            });
        } catch (error) {
            next(error);
        }
    }
}
