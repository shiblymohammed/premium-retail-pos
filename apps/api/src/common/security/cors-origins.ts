export function resolveCorsOrigins(configuredOrigins?: string, nodeEnv = process.env.NODE_ENV): string[] {
  if (nodeEnv === 'production' && !configuredOrigins?.trim()) {
    throw new Error('CORS_ORIGIN must list the trusted frontend origin(s) in production');
  }

  const origins = (configuredOrigins?.trim() || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (nodeEnv !== 'production') origins.push('http://localhost:3001');

  if (origins.some((origin) => origin === '*' || !/^https?:\/\//i.test(origin))) {
    throw new Error('CORS_ORIGIN must contain explicit http(s) origins; wildcard origins are not allowed');
  }
  return [...new Set(origins)];
}
