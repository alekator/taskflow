import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ProjectRole, TaskStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Server } from 'http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type LoginResponse = {
  user: { id: string; email: string; role: string; name: string | null };
  accessToken: string;
  refreshToken: string;
};

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Server;

  const api = (path: string) => `/api${path}`;

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

  function authHeader(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
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
  }

  async function login(email: string, password: string) {
    const res = await request(server)
      .post(api('/auth/login'))
      .send({ email, password })
      .expect(201);

    return res.body as LoginResponse;
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = mod.createNestApplication();
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
    await prisma.task.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.auditLog.deleteMany();
  });

  afterAll(async () => {
    await prisma.task.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.auditLog.deleteMany();
    await app.close();
  });

  it('returns task and project notifications scoped to accessible workspace items', async () => {
    const admin = await login(creds.admin.email, creds.admin.password);
    const member = await login(creds.user1.email, creds.user1.password);

    const projectRes = await request(server)
      .post(api('/projects'))
      .set(authHeader(admin.accessToken))
      .send({ name: 'Notifications Project', description: 'notify test' })
      .expect(201);
    const project = projectRes.body as { id: string };

    await request(server)
      .post(api(`/projects/${project.id}/members`))
      .set(authHeader(admin.accessToken))
      .send({ userId: member.user.id, role: ProjectRole.MEMBER })
      .expect(201);

    const taskRes = await request(server)
      .post(api(`/projects/${project.id}/tasks`))
      .set(authHeader(admin.accessToken))
      .send({
        title: 'Notifications Task',
        status: TaskStatus.TODO,
        assigneeId: member.user.id,
      })
      .expect(201);
    const task = taskRes.body as { id: string };

    const res = await request(server)
      .get(api('/notifications'))
      .set(authHeader(member.accessToken))
      .expect(200);

    const body = res.body as {
      items: Array<{
        action: string;
        title: string;
        href: string;
        projectId: string | null;
      }>;
      meta: { total: number };
    };

    expect(body.meta.total).toBeGreaterThanOrEqual(1);
    expect(
      body.items.some(
        (item) =>
          item.action === 'TASK_CREATE' &&
          item.title === 'Task created' &&
          item.href === `/app/tasks/${task.id}`,
      ),
    ).toBe(true);
    expect(
      body.items.some((item) => item.projectId === project.id),
    ).toBe(true);
  });
});
