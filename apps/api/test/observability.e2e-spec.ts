import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Server } from 'http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('Observability (e2e)', () => {
  let app: INestApplication;
  let server: Server;

  const api = (path: string) => `/api${path}`;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(APP_GUARD)
      .useValue({ canActivate: () => true })
      .compile();

    app = mod.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api');
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns liveness and readiness endpoints', async () => {
    const live = await request(server).get(api('/health/live')).expect(200);
    const ready = await request(server).get(api('/health/ready')).expect(200);

    expect((live.body as { status: string }).status).toBe('ok');
    expect(['ready', 'degraded']).toContain(
      (ready.body as { status: string }).status,
    );
  });

  it('keeps x-request-id trace header and exposes metrics endpoint', async () => {
    const traceId = 'obs-e2e-request-id';
    const health = await request(server)
      .get(api('/health'))
      .set('x-request-id', traceId)
      .expect(200);

    expect(health.headers['x-request-id']).toBe(traceId);

    const metrics = await request(server).get(api('/metrics')).expect(200);
    expect(String(metrics.text)).toContain('taskflow_http_requests_total');
    expect(String(metrics.text)).toContain(
      'taskflow_http_request_errors_total',
    );
    expect(String(metrics.text)).toContain(
      'taskflow_http_requests_by_route_total{method="GET",route="/api/health"}',
    );
  });
});
