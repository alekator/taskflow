import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ProjectRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Server } from 'http';
import type { Test as SupertestTest } from 'supertest';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

type LoginResponse = {
  user: { id: string; email: string; role: string; name: string | null };
  accessToken: string;
  refreshToken: string;
};

type TaskPayload = Partial<{
  title: string;
  description: string;
  status: string;
  priority: string;
  order: number;
  dueDate: string | null;
}>;

type TaskResponse = {
  id: string;
  title: string;
  version: number;
  assigneeId: string | null;
};

describe('RBAC (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Server;

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
    user2: {
      email: 'user2@test.com',
      password: '123456',
      name: 'User Two',
      role: 'USER' as const,
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

  function refresh(refreshToken: string): SupertestTest {
    return request(server).post(api('/auth/refresh')).send({ refreshToken });
  }

  function logout(accessToken: string): SupertestTest {
    return request(server)
      .post(api('/auth/logout'))
      .set('Authorization', `Bearer ${accessToken}`);
  }

  function authHeader(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  function ifMatchHeader(version: number) {
    return { 'If-Match': String(version) };
  }

  async function ensureUsers() {
    const passwordHash = await bcrypt.hash('123456', 10);

    await prisma.user.upsert({
      where: { email: creds.admin.email },
      update: { name: creds.admin.name, role: creds.admin.role, passwordHash },
      create: {
        email: creds.admin.email,
        name: creds.admin.name,
        role: creds.admin.role,
        passwordHash,
      },
    });

    await prisma.user.upsert({
      where: { email: creds.user1.email },
      update: { name: creds.user1.name, role: creds.user1.role, passwordHash },
      create: {
        email: creds.user1.email,
        name: creds.user1.name,
        role: creds.user1.role,
        passwordHash,
      },
    });

    await prisma.user.upsert({
      where: { email: creds.user2.email },
      update: { name: creds.user2.name, role: creds.user2.role, passwordHash },
      create: {
        email: creds.user2.email,
        name: creds.user2.name,
        role: creds.user2.role,
        passwordHash,
      },
    });

    const admin = await prisma.user.findUnique({
      where: { email: creds.admin.email },
    });
    const user1 = await prisma.user.findUnique({
      where: { email: creds.user1.email },
    });
    const user2 = await prisma.user.findUnique({
      where: { email: creds.user2.email },
    });

    if (!admin || !user1 || !user2) throw new Error('Failed to ensure users');

    return { admin, user1, user2 };
  }

  async function cleanDbKeepUsers() {
    await prisma.task.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
  }

  async function getTaskVersion(taskId: string): Promise<number> {
    const task = (await prisma.task.findUnique({
      where: { id: taskId },
      select: { version: true },
    })) as { version: number } | null;
    if (!task) throw new Error('Task not found while reading version');
    return task.version;
  }

  async function createProject(
    accessToken: string,
    data?: { name?: string; description?: string },
  ) {
    const res = await request(server)
      .post(api('/projects'))
      .set(authHeader(accessToken))
      .send({
        name: data?.name ?? 'Test Project',
        description: data?.description ?? 'E2E project',
      })
      .expect(201);

    return res.body as { id: string; ownerId: string; name: string };
  }

  function addMember(
    accessToken: string,
    projectId: string,
    userId: string,
    role?: ProjectRole,
  ): SupertestTest {
    const payload: { userId: string; role?: ProjectRole } = { userId };
    if (role) payload.role = role;

    return request(server)
      .post(api(`/projects/${projectId}/members`))
      .set(authHeader(accessToken))
      .send(payload);
  }

  function setMemberRole(
    accessToken: string,
    projectId: string,
    userId: string,
    role: ProjectRole,
  ): SupertestTest {
    return request(server)
      .patch(api(`/projects/${projectId}/members/${userId}`))
      .set(authHeader(accessToken))
      .send({ role });
  }

  function createTask(
    accessToken: string,
    projectId: string,
    data?: TaskPayload,
  ): SupertestTest {
    return request(server)
      .post(api(`/projects/${projectId}/tasks`))
      .set(authHeader(accessToken))
      .send({
        title: data?.title ?? 'Task 1',
        description: data?.description,
        status: data?.status,
        priority: data?.priority,
        order: data?.order,
        dueDate: data?.dueDate,
      });
  }

  function listTasks(accessToken: string, projectId: string): SupertestTest {
    return request(server)
      .get(api(`/projects/${projectId}/tasks`))
      .set(authHeader(accessToken));
  }

  function updateTask(
    accessToken: string,
    projectId: string,
    taskId: string,
    data: TaskPayload,
    ifMatchVersion?: number,
  ): SupertestTest {
    const req = request(server)
      .patch(api(`/projects/${projectId}/tasks/${taskId}`))
      .set(authHeader(accessToken));
    if (ifMatchVersion !== undefined) req.set(ifMatchHeader(ifMatchVersion));
    return req.send(data);
  }

  function deleteTask(
    accessToken: string,
    projectId: string,
    taskId: string,
    ifMatchVersion?: number,
  ): SupertestTest {
    const req = request(server)
      .delete(api(`/projects/${projectId}/tasks/${taskId}`))
      .set(authHeader(accessToken));
    if (ifMatchVersion !== undefined) req.set(ifMatchHeader(ifMatchVersion));
    return req;
  }

  function assignTask(
    accessToken: string,
    projectId: string,
    taskId: string,
    assigneeId: string,
  ): SupertestTest {
    return request(server)
      .patch(api(`/projects/${projectId}/tasks/${taskId}/assign`))
      .set(authHeader(accessToken))
      .send({ assigneeId });
  }

  function unassignTask(
    accessToken: string,
    projectId: string,
    taskId: string,
  ): SupertestTest {
    return request(server)
      .patch(api(`/projects/${projectId}/tasks/${taskId}/unassign`))
      .set(authHeader(accessToken));
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

  it('health: GET /api/health returns ok', async () => {
    await request(server)
      .get(api('/health'))
      .expect(200)
      .expect((r) => {
        const body = r.body as { status?: string; timestamp?: string };
        expect(body.status).toBe('ok');
        expect(typeof body.timestamp).toBe('string');
      });
  });

  it('auth: refresh rotates refresh token + old refresh becomes invalid', async () => {
    const { accessToken, refreshToken } = await login(
      creds.admin.email,
      creds.admin.password,
    );

    const r1 = await refresh(refreshToken).expect(201);
    const r1Body = r1.body as LoginResponse;
    expect(r1Body.accessToken).toBeTruthy();
    expect(r1Body.refreshToken).toBeTruthy();

    const refreshToken2 = r1Body.refreshToken;
    expect(refreshToken2).not.toBe(refreshToken);
    await refresh(refreshToken).expect(401);

    await refresh(refreshToken2).expect(201);

    await logout(accessToken).expect(201);

    await refresh(refreshToken2).expect(401);
  });

  it('projects: OWNER can add MEMBER; MANAGER cannot add MANAGER', async () => {
    const { admin, user1, user2 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    await addMember(
      adminLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MEMBER,
    ).expect(201);

    await addMember(
      adminLogin.accessToken,
      project.id,
      user2.id,
      ProjectRole.MEMBER,
    ).expect(201);
    await setMemberRole(
      adminLogin.accessToken,
      project.id,
      user2.id,
      ProjectRole.MANAGER,
    ).expect(200);

    const user2Login = await login(creds.user2.email, creds.user2.password);
    const res = await addMember(
      user2Login.accessToken,
      project.id,
      admin.id,
      ProjectRole.MANAGER,
    );
    expect([403, 409]).toContain(res.status);
  });

  it('tasks: MEMBER can create task and becomes assignee automatically', async () => {
    const { user1 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    await addMember(
      adminLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MEMBER,
    ).expect(201);

    const user1Login = await login(creds.user1.email, creds.user1.password);

    const created = await createTask(user1Login.accessToken, project.id, {
      title: 'Member Task',
    }).expect(201);
    const createdBody = created.body as TaskResponse;
    expect(createdBody.title).toBe('Member Task');
    expect(createdBody.assigneeId).toBe(user1.id);
  });

  it('tasks: non-member cannot list tasks (403)', async () => {
    const { user1 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    await addMember(
      adminLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MEMBER,
    ).expect(201);

    const user2Login = await login(creds.user2.email, creds.user2.password);

    const res = await listTasks(user2Login.accessToken, project.id);
    expect([403, 404]).toContain(res.status);
  });

  it('tasks: MEMBER cannot update чужую задачу (not assignee)', async () => {
    const { user1, user2 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    await addMember(
      adminLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MEMBER,
    ).expect(201);
    await addMember(
      adminLogin.accessToken,
      project.id,
      user2.id,
      ProjectRole.MEMBER,
    ).expect(201);

    const user1Login = await login(creds.user1.email, creds.user1.password);
    const user2Login = await login(creds.user2.email, creds.user2.password);

    const created = await createTask(user1Login.accessToken, project.id, {
      title: 'T',
    }).expect(201);
    const createdBody = created.body as TaskResponse;

    await updateTask(user2Login.accessToken, project.id, createdBody.id, {
      title: 'Hacked',
    }).expect(403);
  });

  it('tasks: MEMBER can update own assigned task', async () => {
    const { user1 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);
    await addMember(
      adminLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MEMBER,
    ).expect(201);

    const user1Login = await login(creds.user1.email, creds.user1.password);

    const created = await createTask(user1Login.accessToken, project.id, {
      title: 'Before',
    }).expect(201);
    const createdBody = created.body as TaskResponse;

    const updated = await updateTask(
      user1Login.accessToken,
      project.id,
      createdBody.id,
      { title: 'After' },
      await getTaskVersion(createdBody.id),
    ).expect(200);
    const updatedBody = updated.body as TaskResponse;
    expect(updatedBody.title).toBe('After');
  });

  it('tasks: MEMBER cannot delete чужую задачу', async () => {
    const { user1, user2 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);
    await addMember(
      adminLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MEMBER,
    ).expect(201);
    await addMember(
      adminLogin.accessToken,
      project.id,
      user2.id,
      ProjectRole.MEMBER,
    ).expect(201);

    const user1Login = await login(creds.user1.email, creds.user1.password);
    const user2Login = await login(creds.user2.email, creds.user2.password);

    const created = await createTask(user1Login.accessToken, project.id, {
      title: 'Del',
    }).expect(201);
    const createdBody = created.body as TaskResponse;

    await deleteTask(user2Login.accessToken, project.id, createdBody.id).expect(
      403,
    );
  });

  it('tasks: MANAGER can assign/unassign; MEMBER cannot assign/unassign', async () => {
    const { user1, user2 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    await addMember(
      adminLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MEMBER,
    ).expect(201);
    await addMember(
      adminLogin.accessToken,
      project.id,
      user2.id,
      ProjectRole.MEMBER,
    ).expect(201);

    await setMemberRole(
      adminLogin.accessToken,
      project.id,
      user2.id,
      ProjectRole.MANAGER,
    ).expect(200);

    const user1Login = await login(creds.user1.email, creds.user1.password);
    const user2Login = await login(creds.user2.email, creds.user2.password);

    const createdByAdmin = await createTask(
      adminLogin.accessToken,
      project.id,
      { title: 'Task' },
    ).expect(201);
    const createdByAdminBody = createdByAdmin.body as TaskResponse;

    await assignTask(
      user1Login.accessToken,
      project.id,
      createdByAdminBody.id,
      user1.id,
    ).expect(403);

    const assigned = await assignTask(
      user2Login.accessToken,
      project.id,
      createdByAdminBody.id,
      user1.id,
    ).expect(200);
    const assignedBody = assigned.body as TaskResponse;
    expect(assignedBody.assigneeId).toBe(user1.id);

    const unassigned = await unassignTask(
      user2Login.accessToken,
      project.id,
      createdByAdminBody.id,
    ).expect(200);
    const unassignedBody = unassigned.body as TaskResponse;
    expect(unassignedBody.assigneeId).toBeNull();
  });

  it('tasks: cannot assign user who is not in project', async () => {
    const { user1, user2 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    await addMember(
      adminLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MEMBER,
    ).expect(201);

    const task = await createTask(adminLogin.accessToken, project.id, {
      title: 'T',
    }).expect(201);
    const taskBody = task.body as TaskResponse;

    await assignTask(
      adminLogin.accessToken,
      project.id,
      taskBody.id,
      user2.id,
    ).expect(403);
  });
});
