import { Request, Response, NextFunction, RequestHandler } from 'express';

type Bucket = { count: number; resetAt: number };

export function createApiRateLimitMiddleware(options?: {
  maxRequests?: number;
  windowMs?: number;
  now?: () => number;
}): RequestHandler {
  const maxRequests = options?.maxRequests ?? positiveInt(process.env.API_RATE_LIMIT_MAX, 600);
  const windowMs = options?.windowMs ?? positiveInt(process.env.API_RATE_LIMIT_WINDOW_MS, 60_000);
  const now = options?.now ?? Date.now;
  const buckets = new Map<string, Bucket>();
  let requestsSinceCleanup = 0;

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/v1/health/')) return next();
    const currentTime = now();
    const clientKey = req.ip || req.socket.remoteAddress || 'unknown';
    let bucket = buckets.get(clientKey);
    if (!bucket || bucket.resetAt <= currentTime) {
      bucket = { count: 0, resetAt: currentTime + windowMs };
      buckets.set(clientKey, bucket);
    }
    bucket.count += 1;
    requestsSinceCleanup += 1;

    if (requestsSinceCleanup >= 1000 || buckets.size > 20_000) {
      requestsSinceCleanup = 0;
      for (const [key, value] of buckets) {
        if (value.resetAt <= currentTime) buckets.delete(key);
      }
      while (buckets.size > 20_000) buckets.delete(buckets.keys().next().value!);
    }

    if (bucket.count > maxRequests) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000))));
      return res.status(429).json({ statusCode: 429, message: 'Too many requests. Please try again later.' });
    }
    return next();
  };
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error('API rate-limit settings must be positive integers');
  return parsed;
}
