import { Request, Response, NextFunction } from 'express';
import redis from '../config/redis';
import { logger } from '../utils/logger';

export const idempotencyGuard = async (req: Request, res: Response, next: NextFunction) => {
    // Only apply to mutating methods
    if (!['POST', 'PATCH', 'PUT'].includes(req.method)) {
        return next();
    }

    const key = req.headers['idempotency-key'];
    if (!key || typeof key !== 'string') {
        return next();
    }

    const cacheKey = `idempotency:${req.path}:${key}`;

    try {
        const cachedResponse = await redis.get(cacheKey);
        if (cachedResponse) {
            logger.info(`Idempotency hit for key: ${key}`);
            const parsed = JSON.parse(cachedResponse);
            return res.status(parsed.status).json(parsed.body);
        }

        // Intercept res.json to cache the response
        const originalJson = res.json;
        res.json = (body: any) => {
            // Only cache successful responses or specific errors if needed
            if (res.statusCode >= 200 && res.statusCode < 300) {
                redis.setex(cacheKey, 86400, JSON.stringify({ // 24h cache
                    status: res.statusCode,
                    body
                })).catch(err => logger.error('Idempotency cache failed', err));
            }
            return originalJson.call(res, body);
        };

        next();
    } catch (error) {
        logger.error('Idempotency middleware error', error);
        next();
    }
};
