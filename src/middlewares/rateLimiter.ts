/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse and DDoS attacks
 *
 * Tier strategy:
 *  - authLimiter   : Strict – 10 login attempts per 15 min (brute-force protection)
 *  - writeLimiter  : Moderate – 200 write ops per 5 min per IP
 *  - readLimiter   : Lenient – 500 read requests per minute per IP (supports ~8 req/s per user)
 *  - generalLimiter: Safety net – 1 000 requests per 5 min per IP (production ceiling)
 *
 * Notes:
 *  - All limiters skip the count when NODE_ENV === 'test' (or via DISABLE_RATE_LIMIT env var)
 *    so integration tests never hit limits.
 *  - In production behind a proxy/load balancer, ensure `app.set('trust proxy', 1)` is set
 *    so `req.ip` reflects the real client IP and not the load balancer.
 */

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { logWarn } from '../utils/logger';

const skipInTest = () => process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === 'true';

// Safety-net limiter — applied globally to ALL routes.
// 1 000 req per 5 min per IP ≈ 3.3 req/s sustained, enough for legitimate heavy dashboards.
export const generalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,   // 5 minutes
  max: 1000,                  // 1 000 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: (req: Request, res: Response) => {
    logWarn(`General rate limit exceeded for IP: ${req.ip} - Path: ${req.path}`);
    res.status(429).json({
      success: false,
      message: 'Too many requests from this IP, please try again later.',
    });
  },
});

// Strict limiter for authentication endpoints — prevents brute-force login attacks.
// 10 failed attempts per 15 min per IP.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,                    // 10 attempts per window
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: (req: Request, res: Response) => {
    logWarn(`Auth rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many login attempts, please try again after 15 minutes.',
    });
  },
});

// Moderate limiter for write operations (POST, PUT, PATCH, DELETE).
// 200 writes per 5 min ≈ prevents bulk mutation abuse while allowing fast workflows.
export const writeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,   // 5 minutes
  max: 200,                   // 200 writes per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: (req: Request, res: Response) => {
    logWarn(`Write rate limit exceeded for IP: ${req.ip} - Method: ${req.method} - Path: ${req.path}`);
    res.status(429).json({
      success: false,
      message: 'Too many write requests, please try again later.',
    });
  },
});

// Lenient limiter for read (GET) endpoints.
// 500 req per minute per IP ≈ supports ~8 req/s per logged-in user with headroom.
export const readLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,   // 1 minute
  max: 500,                   // 500 reads per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'Too many read requests, please try again later.',
    });
  },
});

export default generalLimiter;
