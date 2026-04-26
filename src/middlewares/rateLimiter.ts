import { Request, Response, NextFunction } from 'express';
import redis from '../config/redis';

/**
 * Lua Script for Sliding Window Rate Limiting.
 * KEYS[1]: The key for the user IP
 * ARGV[1]: Current timestamp in ms
 * ARGV[2]: Window size in ms (e.g., 60000 for 1 min)
 * ARGV[3]: Max requests allowed
 */
const RATELIMIT_LUA_SCRIPT = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    local clearBefore = now - window

    redis.call('ZREMRANGEBYSCORE', key, 0, clearBefore)
    local count = redis.call('ZCARD', key)

    if count >= limit then
        return 0
    end

    redis.call('ZADD', key, now, now)
    redis.call('PEXPIRE', key, window)
    return 1
`;

export const apiLimiter = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const key = `rate_limit:${req.ip}`;
        const now = Date.now();
        const windowSize = 60000; // 1 minute
        const maxRequests = 100;

        const allowed = await redis.eval(RATELIMIT_LUA_SCRIPT, 1, key, now, windowSize, maxRequests);
        
        if (!allowed) {
            return res.status(429).json({ error: "Rate limit exceeded" });
        }
        next();
    } catch (error) {
        console.error("Rate Limiter Error:", error);
        // Fail open or fail closed? Failing open to be defensive against redis crash but keeping system up
        next(); 
    }
};
