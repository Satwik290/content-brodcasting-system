import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.get('/me', authenticate, UserController.getMe);
router.get('/teachers', authenticate, UserController.listTeachers);

export default router;
