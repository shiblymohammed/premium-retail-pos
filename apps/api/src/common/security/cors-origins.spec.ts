import { resolveCorsOrigins } from './cors-origins';

describe('CORS origin configuration', () => {
  it('requires explicit origins in production', () => {
    expect(() => resolveCorsOrigins(undefined, 'production')).toThrow('CORS_ORIGIN must list');
  });

  it('accepts only explicit production origins and normalizes trailing slashes', () => {
    expect(resolveCorsOrigins('https://pos.example.com/,https://admin.example.com', 'production'))
      .toEqual(['https://pos.example.com', 'https://admin.example.com']);
  });

  it('rejects wildcard origins', () => {
    expect(() => resolveCorsOrigins('*', 'production')).toThrow('wildcard origins are not allowed');
  });

  it('keeps local development origins explicit', () => {
    expect(resolveCorsOrigins(undefined, 'development')).toEqual(['http://localhost:3000', 'http://localhost:3001']);
  });
});
