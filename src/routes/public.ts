import { Router } from 'express';
import { BroadcastController } from '../controllers/broadcast.controller';
import { apiLimiter } from '../middlewares/rateLimiter';

const router = Router();

// Public Broadcast Engine endpoint with rate limiting
router.get('/live/:teacherId', apiLimiter, BroadcastController.getLiveContent);

export default router;
