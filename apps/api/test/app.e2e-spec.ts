import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('API runtime (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves liveness and confirms PostgreSQL readiness', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health/liveness')
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('ok'));

    await request(app.getHttpServer())
      .get('/api/v1/health/readiness')
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ok');
        expect(body.database).toBe('connected');
      });
  });

  it('protects user data when no access token is supplied', async () => {
    await request(app.getHttpServer()).get('/api/v1/users').expect(401);
  });

  it('rejects malformed login input before authentication', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);
  });
});
