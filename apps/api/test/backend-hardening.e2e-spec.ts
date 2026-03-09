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

  const bruteUser = {
    email: 'security.lock@test.com',
    password: '123456',
    name: 'Security Lock User',
    role: 'USER' as const,
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

    const brutePasswordHash = await bcrypt.hash(bruteUser.password, 10);
    await prisma.user.upsert({
      where: { email: bruteUser.email },
      update: {
        name: bruteUser.name,
        role: bruteUser.role,
        passwordHash: brutePasswordHash,
      },
      create: {
        email: bruteUser.email,
        name: bruteUser.name,
        role: bruteUser.role,
        passwordHash: brutePasswordHash,
      },
    });
  }

  async function cleanDbKeepUsers() {
    await prisma.idempotencyRecord.deleteMany();
    await prisma.taskAttachment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.updateMany({
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
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

  it('locks account after repeated failed login attempts and allows after lock expires', async () => {
    const maxAttempts = Number(process.env.AUTH_LOGIN_MAX_ATTEMPTS ?? '5');

    for (let i = 0; i < maxAttempts - 1; i += 1) {
      await request(server)
        .post(api('/auth/login'))
        .send({ email: bruteUser.email, password: 'wrong-password' })
        .expect(401);
    }

    await request(server)
      .post(api('/auth/login'))
      .send({ email: bruteUser.email, password: 'wrong-password' })
      .expect(403);

    await request(server)
      .post(api('/auth/login'))
      .send({ email: bruteUser.email, password: bruteUser.password })
      .expect(403);

    await prisma.user.update({
      where: { email: bruteUser.email },
      data: {
        lockedUntil: new Date(Date.now() - 60_000),
      },
    });

    await request(server)
      .post(api('/auth/login'))
      .send({ email: bruteUser.email, password: bruteUser.password })
      .expect(201);
  });

  it('rejects attachment upload intent for disallowed mime type', async () => {
    process.env.ATTACHMENTS_ALLOWED_MIME = 'application/pdf,text/plain';

    const adminLogin = await login(admin.email, admin.password);
    const project = await request(server)
      .post(api('/projects'))
      .set(authHeader(adminLogin.accessToken))
      .send({ name: 'Hardening Attachments', description: 'mime guard' })
      .expect(201);
    const projectId = (project.body as { id: string }).id;

    const task = await request(server)
      .post(api(`/projects/${projectId}/tasks`))
      .set(authHeader(adminLogin.accessToken))
      .send({ title: 'Attachment hardening task' })
      .expect(201);
    const taskId = (task.body as { id: string }).id;

    await request(server)
      .post(api(`/tasks/${taskId}/attachments/uploads`))
      .set(authHeader(adminLogin.accessToken))
      .send({
        fileName: 'script.sh',
        mimeType: 'application/x-sh',
        sizeBytes: 128,
      })
      .expect(400);
  });
});
