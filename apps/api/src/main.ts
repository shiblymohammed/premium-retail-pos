import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { createApiRateLimitMiddleware } from './common/middleware/api-rate-limit.middleware';
import { resolveCorsOrigins } from './common/security/cors-origins';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix for all API routes
  app.setGlobalPrefix('api/v1');

  // Security headers (ADR-008)
  app.use(helmet());

  // CORS configuration. Keep development origins explicit; production must set CORS_ORIGIN.
  const corsOrigins = resolveCorsOrigins(process.env.CORS_ORIGIN, process.env.NODE_ENV);
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Broad API flood protection. Login has a stricter shared-database limiter.
  // At multi-instance deployment, mirror this limit at the shared gateway too.
  app.use(createApiRateLimitMiddleware());

  // Global validation pipe — rejects unknown/malformed DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`[POS API] Running on http://localhost:${port}/api/v1`);
}
bootstrap();
