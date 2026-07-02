import rateLimit from 'express-rate-limit';

/**
 * Strict rate limiter for auth endpoints — prevents brute-force attacks.
 * 10 requests per 15 minutes per IP.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    type: 'https://httpstatuses.com/429',
    title: 'Too Many Requests',
    status: 429,
    detail: 'Too many authentication attempts. Please try again in 15 minutes.',
  },
});

/**
 * General API rate limiter — 100 requests per minute per IP.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    type: 'https://httpstatuses.com/429',
    title: 'Too Many Requests',
    status: 429,
    detail: 'Rate limit exceeded. Please slow down your requests.',
  },
});
