import { createApiRateLimitMiddleware } from './api-rate-limit.middleware';

describe('API rate limit middleware', () => {
  it('allows requests until the configured limit, then returns 429 with retry guidance', () => {
    const middleware = createApiRateLimitMiddleware({ maxRequests: 2, windowMs: 60_000, now: () => 1_000 });
    const next = jest.fn();
    const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
    const req: any = { path: '/api/v1/products', ip: '192.0.2.1', socket: {} };

    middleware(req, res, next);
    middleware(req, res, next);
    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '60');
  });

  it('does not throttle health probes', () => {
    const middleware = createApiRateLimitMiddleware({ maxRequests: 1, windowMs: 60_000 });
    const next = jest.fn();
    const req: any = { path: '/api/v1/health/liveness', ip: '192.0.2.2', socket: {} };
    middleware(req, {} as any, next);
    middleware(req, {} as any, next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
