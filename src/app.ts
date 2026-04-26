import express from 'express';
import cors from 'cors';
import { apiLimiter } from './middlewares/rateLimiter';
import { errorHandler } from './middlewares/errorHandler';
import authRoutes from './routes/auth';
import contentRoutes from './routes/content';
import publicRoutes from './routes/public';
import userRoutes from './routes/user';
import analyticsRoutes from './routes/analytics';

import { idempotencyGuard } from './middlewares/idempotency';

import { requestLogger } from './middlewares/logging.middleware';

const app = express();

app.use(cors());
app.use(requestLogger);
app.use(express.json());

// Idempotency for mutations
app.use(idempotencyGuard);

// Global Rate Limiting on all API routes
app.use('/api', apiLimiter);

// Health check
app.get('/health', (req: express.Request, res: express.Response) => {
    res.status(200).json({ status: 'ok' });
});

// Routes v1
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/content', contentRoutes);
app.use('/api/v1/content', publicRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/analytics', analyticsRoutes);

// Global Error Handler
app.use(errorHandler);

export default app;
