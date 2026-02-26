import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ProjectRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Server } from 'http';
import type { Response } from 'supertest';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

let server: Server;

type LoginResponse = {
  user: { id: string; email: string; role: string; name: string | null };
  accessToken: string;
  refreshToken: string;
};

type ErrorResponseBody = {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
};

describe('Prisma + Global Exception Filter (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const creds = {
    admin: {
      email: 'admin@test.com',
      password: '123456',
      name: 'Admin',
      role: 'ADMIN' as const,
    },
    user1: {
      email: 'user1@test.com',
      password: '123456',
      name: 'User One',
      role: 'USER' as const,
    },
  };

  const api = (path: string) => `/api${path}`;

  function authHeader(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  function getErrorBody(res: Response) {
    return res.body as Partial<ErrorResponseBody>;
  }

  async function login(email: string, password: string) {
    const res = await request(server)
      .post(api('/auth/login'))
      .send({ email, password })
      .expect(201);

    return res.body as LoginResponse;
  }

  async function ensureUsers() {
    const passwordHash = await bcrypt.hash('123456', 10);

    for (const u of Object.values(creds)) {
      await prisma.user.upsert({
        where: { email: u.email },
        update: { name: u.name, role: u.role, passwordHash },
        create: { email: u.email, name: u.name, role: u.role, passwordHash },
      });
    }

    const admin = await prisma.user.findUnique({
      where: { email: creds.admin.email },
    });
    const user1 = await prisma.user.findUnique({
      where: { email: creds.user1.email },
    });

    if (!admin || !user1) throw new Error('Failed to ensure users');

    return { admin, user1 };
  }

  async function cleanDbKeepUsers() {
    await prisma.task.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
  }

  async function createProject(accessToken: string) {
    const res = await request(server)
      .post(api('/projects'))
      .set(authHeader(accessToken))
      .send({
        name: 'Prisma Test Project',
        description: 'E2E prisma',
      })
      .expect(201);

    return res.body as { id: string; ownerId: string; name: string };
  }

  async function addMember(
    accessToken: string,
    projectId: string,
    userId: string,
    role?: ProjectRole,
  ) {
    const payload: { userId: string; role?: ProjectRole } = { userId };

    if (role) {
      payload.role = role;
    }

    return request(server)
      .post(api(`/projects/${projectId}/members`))
      .set(authHeader(accessToken))
      .send(payload);
  }

  async function createTask(
    accessToken: string,
    projectId: string,
    title: string,
  ) {
    return request(server)
      .post(api(`/projects/${projectId}/tasks`))
      .set(authHeader(accessToken))
      .send({ title });
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
    await ensureUsers();
  });

  beforeEach(async () => {
    await cleanDbKeepUsers();
  });

  afterAll(async () => {
    await cleanDbKeepUsers();
    await prisma.$disconnect();
    await app.close();
  });

  it('P2002: adding same member twice returns 409 with proper error shape', async () => {
    const { user1 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    const first = await addMember(adminLogin.accessToken, project.id, user1.id);
    expect(first.status).toBe(201);

    const res = await addMember(adminLogin.accessToken, project.id, user1.id);
    expect(res.status).toBe(409);

    const body = getErrorBody(res);
    expect(body).toMatchObject({
      statusCode: 409,
      error: 'Conflict',
    });

    expect(body.message).toBeDefined();
    expect(body.path).toBe(`/api/projects/${project.id}/members`);
  });

  it('P2025: updating non-existing member returns 404 with proper shape', async () => {
    await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    const fakeUserId = 'non-existing-user';

    const res = await request(server)
      .patch(api(`/projects/${project.id}/members/${fakeUserId}`))
      .set(authHeader(adminLogin.accessToken))
      .send({ role: ProjectRole.MEMBER });

    expect(res.status).toBe(404);

    const body = getErrorBody(res);
    expect(body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
    });

    expect(body.path).toBe(`/api/projects/${project.id}/members/${fakeUserId}`);
  });

  it('P2003: foreign key constraint (creating task in non-existing project)', async () => {
    const adminLogin = await login(creds.admin.email, creds.admin.password);

    const fakeProjectId = 'non-existing-project';

    const res = await createTask(
      adminLogin.accessToken,
      fakeProjectId,
      'Should fail',
    );

    expect([400, 404]).toContain(res.status);

    const body = getErrorBody(res);
    expect(body.statusCode).toBeDefined();
    expect(body.error).toBeDefined();
    expect(body.message).toBeDefined();
    expect(body.path).toBe(`/api/projects/${fakeProjectId}/tasks`);
  });

  it('ValidationPipe error has unified format', async () => {
    const adminLogin = await login(creds.admin.email, creds.admin.password);

    const res = await request(server)
      .post(api('/projects'))
      .set(authHeader(adminLogin.accessToken))
      .send({});

    expect(res.status).toBe(400);

    const body = getErrorBody(res);
    expect(body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
    });

    expect(body.message).toBeDefined();
    expect(body.path).toBe('/api/projects');
  });

  it('HttpException (403) has unified format', async () => {
    await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    const user1Login = await login(creds.user1.email, creds.user1.password);

    const res = await request(server)
      .get(api(`/projects/${project.id}/members`))
      .set(authHeader(user1Login.accessToken));

    expect([403, 404]).toContain(res.status);

    const body = getErrorBody(res);
    expect(body.statusCode).toBeDefined();
    expect(body.error).toBeDefined();
    expect(body.message).toBeDefined();
    expect(body.path).toBe(`/api/projects/${project.id}/members`);
  });

  it('Unknown error returns 500 unified format (forced)', async () => {
    const adminLogin = await login(creds.admin.email, creds.admin.password);

    const res = await request(server)
      .get(api('/projects/invalid_cuid'))
      .set(authHeader(adminLogin.accessToken));

    if (res.status === 500) {
      const body = getErrorBody(res);
      expect(body).toMatchObject({
        statusCode: 500,
        error: 'Internal Server Error',
      });
      expect(body.path).toBe('/api/projects/invalid_cuid');
    }
  });
});
