import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ProjectRole, TaskPriority, TaskStatus } from '@prisma/client';
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

describe('Tasks (e2e)', () => {
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
    user3: {
      email: 'user3@test.com',
      password: '123456',
      name: 'User Three',
      role: 'USER' as const,
    },
  };

  const api = (path: string) => `/api${path}`;

  function authHeader(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}` };
  }

  function ifMatchHeader(version: number) {
    return { 'If-Match': String(version) };
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
    const user2 = await prisma.user.findUnique({
      where: { email: creds.user2.email },
    });
    const user3 = await prisma.user.findUnique({
      where: { email: creds.user3.email },
    });

    if (!admin || !user1 || !user2 || !user3)
      throw new Error('Failed to ensure users');

    return { admin, user1, user2, user3 };
  }

  async function cleanDbKeepUsers() {
    await prisma.task.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
  }

  async function createProject(
    accessToken: string,
    data?: { name?: string; description?: string },
  ) {
    const res = await request(server)
      .post(api('/projects'))
      .set(authHeader(accessToken))
      .send({
        name: data?.name ?? 'Tasks Project',
        description: data?.description ?? 'E2E tasks project',
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

  function updateMemberRole(
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

  async function createTask(
    accessToken: string,
    projectId: string,
    dto?: Partial<{
      title: string;
      description: string;
      status: TaskStatus;
      priority: TaskPriority;
      order: number;
      dueDate: string;
    }>,
  ) {
    const res = await request(server)
      .post(api(`/projects/${projectId}/tasks`))
      .set(authHeader(accessToken))
      .send({
        title: dto?.title ?? 'Task 1',
        description: dto?.description,
        status: dto?.status,
        priority: dto?.priority,
        order: dto?.order,
        dueDate: dto?.dueDate,
      })
      .expect(201);

    return res.body as {
      id: string;
      version: number;
      assigneeId: string | null;
      title: string;
      projectId: string;
    };
  }

  async function getTaskVersion(taskId: string): Promise<number> {
    const task = (await prisma.task.findUnique({
      where: { id: taskId },
      select: { version: true },
    })) as { version: number } | null;

    if (!task) throw new Error('Task not found while reading version');
    return task.version;
  }

  function listTasks(
    accessToken: string,
    projectId: string,
    query?: Record<string, string | number>,
  ): SupertestTest {
    const req = request(server)
      .get(api(`/projects/${projectId}/tasks`))
      .set(authHeader(accessToken));

    if (query) req.query(query);

    return req;
  }

  function updateTask(
    accessToken: string,
    projectId: string,
    taskId: string,
    dto: Partial<{
      title: string;
      description: string;
      status: TaskStatus;
      priority: TaskPriority;
      order: number;
      dueDate: string | null;
    }>,
    ifMatchVersion?: number,
  ): SupertestTest {
    const req = request(server)
      .patch(api(`/projects/${projectId}/tasks/${taskId}`))
      .set(authHeader(accessToken));
    if (ifMatchVersion !== undefined) req.set(ifMatchHeader(ifMatchVersion));
    return req.send(dto);
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

  it('tasks: project member can list tasks; non-member gets 403/404', async () => {
    const { user1 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    await addMember(
      adminLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MEMBER,
    ).expect(201);

    const u1 = await login(creds.user1.email, creds.user1.password);
    await listTasks(u1.accessToken, project.id).expect(200);

    const u2 = await login(creds.user2.email, creds.user2.password);
    const res = await listTasks(u2.accessToken, project.id);
    expect([403, 404]).toContain(res.status);
  });

  it('tasks: MEMBER creating a task auto-assigns to self', async () => {
    const { user1 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    await addMember(
      adminLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MEMBER,
    ).expect(201);

    const u1 = await login(creds.user1.email, creds.user1.password);
    const task = await createTask(u1.accessToken, project.id, {
      title: 'Member task',
    });

    expect(task.assigneeId).toBe(user1.id);
  });

  it('tasks: MANAGER/OWNER creating a task does not auto-assign', async () => {
    const { user2 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    const t1 = await createTask(adminLogin.accessToken, project.id, {
      title: 'Owner task',
    });
    expect(t1.assigneeId).toBeNull();

    await addMember(
      adminLogin.accessToken,
      project.id,
      user2.id,
      ProjectRole.MEMBER,
    ).expect(201);
    await updateMemberRole(
      adminLogin.accessToken,
      project.id,
      user2.id,
      ProjectRole.MANAGER,
    ).expect(200);

    const managerLogin = await login(creds.user2.email, creds.user2.password);
    const t2 = await createTask(managerLogin.accessToken, project.id, {
      title: 'Manager task',
    });
    expect(t2.assigneeId).toBeNull();
  });

  it('tasks: MEMBER can update/delete only own assigned tasks', async () => {
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

    const u1 = await login(creds.user1.email, creds.user1.password);
    const u2 = await login(creds.user2.email, creds.user2.password);

    const task1 = await createTask(u1.accessToken, project.id, {
      title: 'Task by user1',
    });
    const task2 = await createTask(u2.accessToken, project.id, {
      title: 'Task by user2',
    });

    await updateTask(
      u1.accessToken,
      project.id,
      task1.id,
      {
        title: 'Updated by user1',
      },
      await getTaskVersion(task1.id),
    ).expect(200);

    await updateTask(u1.accessToken, project.id, task2.id, {
      title: 'Hacked',
    }).expect(403);

    await deleteTask(u1.accessToken, project.id, task2.id).expect(403);

    await deleteTask(
      u1.accessToken,
      project.id,
      task1.id,
      await getTaskVersion(task1.id),
    ).expect(200);
  });

  it('tasks: OWNER/MANAGER can update/delete any task in project', async () => {
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
    await updateMemberRole(
      adminLogin.accessToken,
      project.id,
      user2.id,
      ProjectRole.MANAGER,
    ).expect(200);

    const u1 = await login(creds.user1.email, creds.user1.password);
    const managerLogin = await login(creds.user2.email, creds.user2.password);

    const taskFromMember = await createTask(u1.accessToken, project.id, {
      title: 'Member created',
    });

    await updateTask(
      managerLogin.accessToken,
      project.id,
      taskFromMember.id,
      {
        status: TaskStatus.DONE,
      },
      await getTaskVersion(taskFromMember.id),
    ).expect(200);

    await deleteTask(
      adminLogin.accessToken,
      project.id,
      taskFromMember.id,
      await getTaskVersion(taskFromMember.id),
    ).expect(200);
  });

  it('tasks: assign/unassign allowed only for OWNER/MANAGER', async () => {
    const { user1, user2, user3 } = await ensureUsers();

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
    await addMember(
      adminLogin.accessToken,
      project.id,
      user3.id,
      ProjectRole.MEMBER,
    ).expect(201);

    await updateMemberRole(
      adminLogin.accessToken,
      project.id,
      user2.id,
      ProjectRole.MANAGER,
    ).expect(200);

    const memberLogin = await login(creds.user1.email, creds.user1.password);
    const managerLogin = await login(creds.user2.email, creds.user2.password);

    const task = await createTask(adminLogin.accessToken, project.id, {
      title: 'Assignable',
    });
    expect(task.assigneeId).toBeNull();

    await assignTask(
      memberLogin.accessToken,
      project.id,
      task.id,
      user1.id,
    ).expect(403);

    const assigned = await assignTask(
      managerLogin.accessToken,
      project.id,
      task.id,
      user3.id,
    ).expect(200);
    expect((assigned.body as { assigneeId: string | null }).assigneeId).toBe(
      user3.id,
    );

    const unassigned = await unassignTask(
      managerLogin.accessToken,
      project.id,
      task.id,
    ).expect(200);
    expect(
      (unassigned.body as { assigneeId: string | null }).assigneeId,
    ).toBeNull();
  });

  it('tasks: cannot assign to user NOT in project', async () => {
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
      title: 'Assign target check',
    });

    await assignTask(
      adminLogin.accessToken,
      project.id,
      task.id,
      user2.id,
    ).expect(403);
  });

  it('tasks: update dueDate can set null to clear', async () => {
    const { user1 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    await addMember(
      adminLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MEMBER,
    ).expect(201);

    const memberLogin = await login(creds.user1.email, creds.user1.password);
    const task = await createTask(memberLogin.accessToken, project.id, {
      dueDate: new Date(Date.now() + 86400000).toISOString(),
    });

    const cleared = await updateTask(
      memberLogin.accessToken,
      project.id,
      task.id,
      { dueDate: null },
      await getTaskVersion(task.id),
    ).expect(200);
    expect((cleared.body as { dueDate: string | null }).dueDate).toBeNull();
  });

  it('tasks: update/delete not found -> 404', async () => {
    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    await updateTask(adminLogin.accessToken, project.id, 'no_such_task', {
      title: 'x',
    }).expect(404);
    await deleteTask(adminLogin.accessToken, project.id, 'no_such_task').expect(
      404,
    );
  });

  it('tasks: list ordering by order asc then createdAt asc', async () => {
    const { user1 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    await addMember(
      adminLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MEMBER,
    ).expect(201);
    const memberLogin = await login(creds.user1.email, creds.user1.password);

    const tA = await createTask(memberLogin.accessToken, project.id, {
      title: 'A',
      order: 2,
    });
    const tB = await createTask(memberLogin.accessToken, project.id, {
      title: 'B',
      order: 1,
    });
    const tC = await createTask(memberLogin.accessToken, project.id, {
      title: 'C',
      order: 1,
    });

    const res = await listTasks(memberLogin.accessToken, project.id).expect(
      200,
    );
    const body = res.body as {
      items: Array<{ id: string; title: string }>;
      meta: { page: number; limit: number; total: number; totalPages: number };
    };
    const tasks = body.items;
    const titles = tasks.map((t) => t.title);

    expect(titles[0]).toBe('B');
    expect(titles[1]).toBe('C');
    expect(titles[2]).toBe('A');

    const ids = tasks.map((t) => t.id);
    expect(ids).toEqual([tB.id, tC.id, tA.id]);
    expect(body.meta.total).toBe(3);
    expect(body.meta.page).toBe(1);
  });

  it('tasks: list supports pagination and filters', async () => {
    const { user1 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    await addMember(
      adminLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MEMBER,
    ).expect(201);
    const memberLogin = await login(creds.user1.email, creds.user1.password);

    await createTask(memberLogin.accessToken, project.id, {
      title: 'Alpha task',
      status: TaskStatus.TODO,
    });
    await createTask(memberLogin.accessToken, project.id, {
      title: 'Beta task',
      status: TaskStatus.DONE,
    });

    const res = await listTasks(memberLogin.accessToken, project.id, {
      page: 1,
      limit: 1,
      search: 'task',
      status: TaskStatus.DONE,
      sortBy: 'createdAt',
      sortOrder: 'asc',
    }).expect(200);

    const body = res.body as {
      items: Array<{ title: string; status: TaskStatus }>;
      meta: { page: number; limit: number; total: number; totalPages: number };
    };

    expect(body.items).toHaveLength(1);
    expect(body.items[0].title).toBe('Beta task');
    expect(body.items[0].status).toBe(TaskStatus.DONE);
    expect(body.meta.page).toBe(1);
    expect(body.meta.limit).toBe(1);
    expect(body.meta.total).toBe(1);
    expect(body.meta.totalPages).toBe(1);
  });
});
