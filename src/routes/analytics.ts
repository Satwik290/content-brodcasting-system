import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { authenticate, roleGuard } from '../middlewares/auth';

const router = Router();

router.get('/system', authenticate, roleGuard(['PRINCIPAL']), AnalyticsController.getSystemStats);

export default router;
