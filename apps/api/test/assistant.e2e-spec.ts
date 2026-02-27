import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ProjectRole, TaskStatus } from '@prisma/client';
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

describe('Assistant (e2e)', () => {
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

  async function ensureUsers() {
    const passwordHash = await bcrypt.hash('123456', 10);

    await prisma.user.upsert({
      where: { email: creds.admin.email },
      update: {
        name: creds.admin.name,
        role: creds.admin.role,
        passwordHash,
      },
      create: {
        email: creds.admin.email,
        name: creds.admin.name,
        role: creds.admin.role,
        passwordHash,
      },
    });

    await prisma.user.upsert({
      where: { email: creds.user1.email },
      update: {
        name: creds.user1.name,
        role: creds.user1.role,
        passwordHash,
      },
      create: {
        email: creds.user1.email,
        name: creds.user1.name,
        role: creds.user1.role,
        passwordHash,
      },
    });
  }

  async function login(email: string, password: string) {
    const res = await request(server)
      .post(api('/auth/login'))
      .send({ email, password })
      .expect(201);
    return res.body as LoginResponse;
  }

  function authHeader(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  beforeAll(async () => {
    process.env.ASSISTANT_OPENAI_API_KEY = '';

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
    await prisma.assistantMessage.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
  });

  afterAll(async () => {
    await prisma.assistantMessage.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.$disconnect();
    await app.close();
  });

  it('stores chat history and returns basic workspace insights without OpenAI key', async () => {
    const admin = await login(creds.admin.email, creds.admin.password);
    const user = await prisma.user.findUnique({
      where: { email: creds.user1.email },
      select: { id: true },
    });
    if (!user) throw new Error('user not found');

    const projectRes = await request(server)
      .post(api('/projects'))
      .set(authHeader(admin.accessToken))
      .send({ name: 'Assistant project', description: 'for assistant e2e' })
      .expect(201);
    const project = projectRes.body as { id: string };

    await request(server)
      .post(api(`/projects/${project.id}/members`))
      .set(authHeader(admin.accessToken))
      .send({ userId: user.id, role: ProjectRole.MEMBER })
      .expect(201);

    await request(server)
      .post(api(`/projects/${project.id}/tasks`))
      .set(authHeader(admin.accessToken))
      .send({
        title: 'Assistant todo',
        status: TaskStatus.TODO,
        assigneeId: user.id,
      })
      .expect(201);

    const sendRes = await request(server)
      .post(api('/assistant/messages'))
      .set(authHeader(admin.accessToken))
      .send({ message: 'Give me my workspace stats' })
      .expect(201);

    const sendBody = sendRes.body as {
      mode: 'BASIC' | 'LLM';
      llmEnabled: boolean;
      userMessage: { role: 'USER'; message: string };
      assistantMessage: { role: 'ASSISTANT'; message: string };
    };

    expect(sendBody.mode).toBe('BASIC');
    expect(sendBody.llmEnabled).toBe(false);
    expect(sendBody.userMessage.role).toBe('USER');
    expect(sendBody.assistantMessage.role).toBe('ASSISTANT');
    expect(sendBody.assistantMessage.message).toContain('Workspace snapshot');
    expect(sendBody.assistantMessage.message).toContain('Status breakdown');

    const historyRes = await request(server)
      .get(api('/assistant/history?sortOrder=asc'))
      .set(authHeader(admin.accessToken))
      .expect(200);

    const historyBody = historyRes.body as {
      items: Array<{ role: string; mode: string; message: string }>;
      meta: { total: number };
    };

    expect(historyBody.meta.total).toBe(2);
    expect(historyBody.items[0].role).toBe('USER');
    expect(historyBody.items[1].role).toBe('ASSISTANT');
    expect(historyBody.items[1].mode).toBe('BASIC');
  });
});
