import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ProjectRole, TaskStatus, UserRole } from '@prisma/client';
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

type UsersListResponse = {
  items: Array<{
    id: string;
    email: string;
    role: UserRole;
    name: string | null;
    projectCount: number;
    activeTasksCount: number;
    completedTasksCount: number;
    totalTasksCount: number;
    projects: Array<{ id: string; name: string; role: ProjectRole }>;
  }>;
  meta: { page: number; limit: number; total: number; totalPages: number };
};

describe('Users workspace (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Server;

  const creds = {
    admin: {
      email: 'admin@test.com',
      password: '123456',
      name: 'Admin',
      role: UserRole.ADMIN,
    },
    manager: {
      email: 'manager@test.com',
      password: '123456',
      name: 'Project Manager',
      role: UserRole.MANAGER,
    },
    user: {
      email: 'user@test.com',
      password: '123456',
      name: 'Regular User',
      role: UserRole.USER,
    },
  };

  const api = (path: string) => `/api${path}`;

  async function login(email: string, password: string) {
    const res = await request(server)
      .post(api('/auth/login'))
      .send({ email, password })
      .expect(201);

    return res.body as LoginResponse;
  }

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
      where: { email: creds.manager.email },
      update: {
        name: creds.manager.name,
        role: creds.manager.role,
        passwordHash,
      },
      create: {
        email: creds.manager.email,
        name: creds.manager.name,
        role: creds.manager.role,
        passwordHash,
      },
    });

    await prisma.user.upsert({
      where: { email: creds.user.email },
      update: {
        name: creds.user.name,
        role: creds.user.role,
        passwordHash,
      },
      create: {
        email: creds.user.email,
        name: creds.user.name,
        role: creds.user.role,
        passwordHash,
      },
    });
  }

  async function cleanDbKeepUsers() {
    await prisma.task.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
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
    await app.close();
  });

  it('allows ADMIN to read users list with workload and project stats', async () => {
    const admin = await prisma.user.findUnique({
      where: { email: creds.admin.email },
      select: { id: true },
    });
    const manager = await prisma.user.findUnique({
      where: { email: creds.manager.email },
      select: { id: true },
    });
    const user = await prisma.user.findUnique({
      where: { email: creds.user.email },
      select: { id: true },
    });

    if (!admin || !manager || !user) throw new Error('Users missing');

    const project = await prisma.project.create({
      data: {
        name: 'Users scope project',
        description: 'stats source',
        ownerId: admin.id,
        members: {
          create: [
            { userId: admin.id, role: ProjectRole.OWNER },
            { userId: manager.id, role: ProjectRole.MANAGER },
            { userId: user.id, role: ProjectRole.MEMBER },
          ],
        },
      },
      select: { id: true },
    });

    await prisma.task.createMany({
      data: [
        {
          projectId: project.id,
          title: 'Task A',
          status: TaskStatus.TODO,
          assigneeId: user.id,
          order: 1,
        },
        {
          projectId: project.id,
          title: 'Task B',
          status: TaskStatus.DONE,
          assigneeId: user.id,
          order: 2,
        },
        {
          projectId: project.id,
          title: 'Task C',
          status: TaskStatus.DONE,
          assigneeId: manager.id,
          order: 3,
        },
      ],
    });

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const res = await request(server)
      .get(api('/users'))
      .set('Authorization', `Bearer ${adminLogin.accessToken}`)
      .expect(200);

    const body = res.body as UsersListResponse;
    const userRow = body.items.find((item) => item.email === creds.user.email);

    expect(userRow).toBeDefined();
    expect(userRow?.projectCount).toBe(1);
    expect(userRow?.activeTasksCount).toBe(1);
    expect(userRow?.completedTasksCount).toBe(1);
    expect(userRow?.totalTasksCount).toBe(2);
    expect(userRow?.projects[0]?.name).toBe('Users scope project');
  });

  it('allows non-admin users to read workspace users list', async () => {
    const managerLogin = await login(
      creds.manager.email,
      creds.manager.password,
    );
    await request(server)
      .get(api('/users'))
      .set('Authorization', `Bearer ${managerLogin.accessToken}`)
      .expect(200);

    const userLogin = await login(creds.user.email, creds.user.password);
    await request(server)
      .get(api('/users'))
      .set('Authorization', `Bearer ${userLogin.accessToken}`)
      .expect(200);
  });

  it('supports filtering by role', async () => {
    const adminLogin = await login(creds.admin.email, creds.admin.password);

    const res = await request(server)
      .get(api('/users'))
      .query({ role: 'MANAGER' })
      .set('Authorization', `Bearer ${adminLogin.accessToken}`)
      .expect(200);

    const body = res.body as UsersListResponse;
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((item) => item.role === UserRole.MANAGER)).toBe(
      true,
    );
  });
});
