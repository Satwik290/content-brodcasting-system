import { Router } from 'express';
import { ContentController, uploadMiddleware } from '../controllers/content.controller';
import { authenticate, roleGuard } from '../middlewares/auth';

const router = Router();

// Secure metadata endpoints
router.post('/upload', authenticate, roleGuard(['TEACHER', 'PRINCIPAL']), uploadMiddleware, ContentController.uploadContent);
router.get('/my-uploads', authenticate, roleGuard(['TEACHER', 'PRINCIPAL']), ContentController.getMyUploads);

// Admin endpoints
router.get('/admin/pending', authenticate, roleGuard(['PRINCIPAL']), ContentController.getPendingContent);
router.post('/admin/:id/approve', authenticate, roleGuard(['PRINCIPAL']), ContentController.approve);
router.post('/admin/:id/reject', authenticate, roleGuard(['PRINCIPAL']), ContentController.reject);

export default router;
