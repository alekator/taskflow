import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { Server } from 'http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

type LoginResponse = {
  user: { id: string; email: string; role: string; name: string | null };
  accessToken: string;
  refreshToken: string;
};

describe('Backend hardening (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Server;

  const admin = {
    email: 'admin@test.com',
    password: '123456',
    name: 'Admin',
    role: 'ADMIN' as const,
  };

  const api = (path: string) => `/api${path}`;

  function authHeader(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  async function login(email: string, password: string) {
    const res = await request(server)
      .post(api('/auth/login'))
      .send({ email, password })
      .expect(201);

    return res.body as LoginResponse;
  }

  async function ensureUser() {
    const passwordHash = await bcrypt.hash(admin.password, 10);
    await prisma.user.upsert({
      where: { email: admin.email },
      update: {
        name: admin.name,
        role: admin.role,
        passwordHash,
      },
      create: {
        email: admin.email,
        name: admin.name,
        role: admin.role,
        passwordHash,
      },
    });
  }

  async function cleanDbKeepUsers() {
    await prisma.idempotencyRecord.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.auditLog.deleteMany();
  }

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
    prisma = app.get(PrismaService);
    await ensureUser();
  });

  beforeEach(async () => {
    await cleanDbKeepUsers();
  });

  afterAll(async () => {
    await cleanDbKeepUsers();
    await app.close();
  });

  it('replays POST by Idempotency-Key and does not duplicate entity', async () => {
    const adminLogin = await login(admin.email, admin.password);
    const key = 'project-create-1';

    const first = await request(server)
      .post(api('/projects'))
      .set(authHeader(adminLogin.accessToken))
      .set('Idempotency-Key', key)
      .send({ name: 'Idempotent project', description: 'A' })
      .expect(201);

    const second = await request(server)
      .post(api('/projects'))
      .set(authHeader(adminLogin.accessToken))
      .set('Idempotency-Key', key)
      .send({ name: 'Idempotent project', description: 'A' })
      .expect(201);

    const firstBody = first.body as { id: string };
    const secondBody = second.body as { id: string };
    expect(secondBody.id).toBe(firstBody.id);

    const count = await prisma.project.count({
      where: { name: 'Idempotent project' },
    });
    expect(count).toBe(1);
  });

  it('rejects Idempotency-Key reuse with different payload', async () => {
    const adminLogin = await login(admin.email, admin.password);
    const key = 'project-create-2';

    await request(server)
      .post(api('/projects'))
      .set(authHeader(adminLogin.accessToken))
      .set('Idempotency-Key', key)
      .send({ name: 'Payload A', description: 'A' })
      .expect(201);

    await request(server)
      .post(api('/projects'))
      .set(authHeader(adminLogin.accessToken))
      .set('Idempotency-Key', key)
      .send({ name: 'Payload B', description: 'B' })
      .expect(409);
  });

  it('requires If-Match for project update', async () => {
    const adminLogin = await login(admin.email, admin.password);
    const created = await request(server)
      .post(api('/projects'))
      .set(authHeader(adminLogin.accessToken))
      .send({ name: 'Versioned project', description: 'v1' })
      .expect(201);
    const body = created.body as { id: string };

    await request(server)
      .patch(api(`/projects/${body.id}`))
      .set(authHeader(adminLogin.accessToken))
      .send({ name: 'Versioned project v2' })
      .expect(428);
  });

  it('returns 412 for stale If-Match version', async () => {
    const adminLogin = await login(admin.email, admin.password);
    const created = await request(server)
      .post(api('/projects'))
      .set(authHeader(adminLogin.accessToken))
      .send({ name: 'Versioned project', description: 'v1' })
      .expect(201);
    const body = created.body as { id: string; version: number };

    const updated = await request(server)
      .patch(api(`/projects/${body.id}`))
      .set(authHeader(adminLogin.accessToken))
      .set('If-Match', String(body.version))
      .send({ description: 'v2' })
      .expect(200);

    const updatedBody = updated.body as { version: number };
    expect(updatedBody.version).toBe(body.version + 1);

    await request(server)
      .patch(api(`/projects/${body.id}`))
      .set(authHeader(adminLogin.accessToken))
      .set('If-Match', String(body.version))
      .send({ description: 'v3' })
      .expect(412);
  });
});
