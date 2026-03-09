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

type MemberResponse = {
  userId: string;
  role: ProjectRole;
};

describe('Projects / Members (e2e)', () => {
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
        name: data?.name ?? 'Members Project',
        description: data?.description ?? 'E2E members project',
      })
      .expect(201);

    return res.body as { id: string; ownerId: string; name: string };
  }

  function listMembers(accessToken: string, projectId: string): SupertestTest {
    return request(server)
      .get(api(`/projects/${projectId}/members`))
      .set(authHeader(accessToken));
  }

  function listProjects(
    accessToken: string,
    query?: Record<string, string | number>,
  ): SupertestTest {
    const req = request(server)
      .get(api('/projects'))
      .set(authHeader(accessToken));

    if (query) req.query(query);

    return req;
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

  function removeMember(
    accessToken: string,
    projectId: string,
    userId: string,
  ): SupertestTest {
    return request(server)
      .delete(api(`/projects/${projectId}/members/${userId}`))
      .set(authHeader(accessToken));
  }

  function leaveProject(accessToken: string, projectId: string): SupertestTest {
    return request(server)
      .post(api(`/projects/${projectId}/leave`))
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

  it('projects: rejects too long name or description on create', async () => {
    const adminLogin = await login(creds.admin.email, creds.admin.password);

    await request(server)
      .post(api('/projects'))
      .set(authHeader(adminLogin.accessToken))
      .send({
        name: 'p'.repeat(101),
        description: 'd'.repeat(1001),
      })
      .expect(400);
  });

  it('members: only project member can list members', async () => {
    const { user1 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    const u2 = await login(creds.user2.email, creds.user2.password);
    const res = await listMembers(u2.accessToken, project.id);
    expect([403, 404]).toContain(res.status);

    await addMember(
      adminLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MEMBER,
    ).expect(201);
    const u1 = await login(creds.user1.email, creds.user1.password);

    const listed = await listMembers(u1.accessToken, project.id).expect(200);
    const listedBody = listed.body as {
      items: Array<{ userId: string }>;
      meta: { page: number; total: number };
    };
    expect(Array.isArray(listedBody.items)).toBe(true);
    expect(listedBody.meta.page).toBe(1);
    expect(listedBody.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('projects: list returns paginated contract', async () => {
    const adminLogin = await login(creds.admin.email, creds.admin.password);
    await createProject(adminLogin.accessToken, { name: 'Paged Project' });

    const res = await listProjects(adminLogin.accessToken).expect(200);
    const body = res.body as {
      items: Array<{ id: string; name: string }>;
      meta: { page: number; limit: number; total: number; totalPages: number };
    };

    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.meta.page).toBe(1);
    expect(body.meta.limit).toBe(20);
    expect(body.meta.total).toBeGreaterThanOrEqual(1);
    expect(body.meta.totalPages).toBeGreaterThanOrEqual(1);
  });

  it('projects: ADMIN sees projects created by other users too', async () => {
    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const userLogin = await login(creds.user1.email, creds.user1.password);

    await createProject(adminLogin.accessToken, { name: 'Admin Project' });
    await createProject(userLogin.accessToken, { name: 'User Project' });

    const res = await listProjects(adminLogin.accessToken).expect(200);
    const body = res.body as {
      items: Array<{ id: string; name: string }>;
      meta: { page: number; limit: number; total: number; totalPages: number };
    };

    const names = body.items.map((item) => item.name);
    expect(names).toContain('Admin Project');
    expect(names).toContain('User Project');
  });

  it('projects: ADMIN list is scoped to current workspace', async () => {
    const adminLogin = await login(creds.admin.email, creds.admin.password);
    await createProject(adminLogin.accessToken, {
      name: 'Main Workspace Project',
    });

    const otherWorkspace = await prisma.workspace.create({
      data: {
        name: 'External Workspace',
        slug: `external-${Date.now()}`,
      },
      select: { id: true },
    });

    const outsiderPasswordHash = await bcrypt.hash('123456', 10);
    const outsider = await prisma.user.upsert({
      where: { email: 'outsider.workspace@test.com' },
      update: {
        name: 'Workspace Outsider',
        role: 'USER',
        passwordHash: outsiderPasswordHash,
        defaultWorkspaceId: otherWorkspace.id,
      },
      create: {
        email: 'outsider.workspace@test.com',
        name: 'Workspace Outsider',
        role: 'USER',
        passwordHash: outsiderPasswordHash,
        defaultWorkspaceId: otherWorkspace.id,
      },
      select: { id: true },
    });

    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: otherWorkspace.id,
          userId: outsider.id,
        },
      },
      update: { role: 'MEMBER' },
      create: {
        workspaceId: otherWorkspace.id,
        userId: outsider.id,
        role: 'MEMBER',
      },
    });

    const hiddenProject = await prisma.project.create({
      data: {
        name: 'External Workspace Project',
        description: 'Should be hidden from main workspace',
        ownerId: outsider.id,
        workspaceId: otherWorkspace.id,
      },
      select: { id: true },
    });

    await prisma.projectMember.create({
      data: {
        projectId: hiddenProject.id,
        userId: outsider.id,
        role: ProjectRole.OWNER,
      },
    });

    const res = await listProjects(adminLogin.accessToken).expect(200);
    const body = res.body as {
      items: Array<{ id: string; name: string }>;
    };

    const names = body.items.map((item) => item.name);
    expect(names).toContain('Main Workspace Project');
    expect(names).not.toContain('External Workspace Project');
  });

  it('members: OWNER can add MEMBER (default role)', async () => {
    const { user1 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    const added = await addMember(
      adminLogin.accessToken,
      project.id,
      user1.id,
    ).expect(201);
    const addedBody = added.body as MemberResponse;
    expect(addedBody.userId).toBe(user1.id);
    expect(addedBody.role).toBe(ProjectRole.MEMBER);
  });

  it('members: adding same user twice -> 409 (Conflict)', async () => {
    const { user1 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    await addMember(adminLogin.accessToken, project.id, user1.id).expect(201);
    await addMember(adminLogin.accessToken, project.id, user1.id).expect(409);
  });

  it('members: cannot add user from another workspace', async () => {
    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    const otherWorkspace = await prisma.workspace.create({
      data: {
        name: 'Members Isolation Workspace',
        slug: `members-iso-${Date.now()}`,
      },
      select: { id: true },
    });

    const outsiderPasswordHash = await bcrypt.hash('123456', 10);
    const outsider = await prisma.user.upsert({
      where: { email: 'outsider.members@test.com' },
      update: {
        name: 'Members Outsider',
        role: 'USER',
        passwordHash: outsiderPasswordHash,
        defaultWorkspaceId: otherWorkspace.id,
      },
      create: {
        email: 'outsider.members@test.com',
        name: 'Members Outsider',
        role: 'USER',
        passwordHash: outsiderPasswordHash,
        defaultWorkspaceId: otherWorkspace.id,
      },
      select: { id: true },
    });

    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: otherWorkspace.id,
          userId: outsider.id,
        },
      },
      update: { role: 'MEMBER' },
      create: {
        workspaceId: otherWorkspace.id,
        userId: outsider.id,
        role: 'MEMBER',
      },
    });

    await addMember(adminLogin.accessToken, project.id, outsider.id).expect(
      403,
    );
  });

  it('members: OWNER cannot add owner as member (should be 409 or 4xx)', async () => {
    const { admin } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    const res = await addMember(
      adminLogin.accessToken,
      project.id,
      admin.id,
      ProjectRole.MEMBER,
    );
    expect([409, 400, 403]).toContain(res.status);
  });

  it('members: MANAGER can add only MEMBER (cannot add MANAGER/OWNER)', async () => {
    const { user1, user2, user3 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

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

    await addMember(
      managerLogin.accessToken,
      project.id,
      user3.id,
      ProjectRole.MEMBER,
    ).expect(201);

    await addMember(
      managerLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MANAGER,
    ).expect(403);

    const resOwner = await addMember(
      managerLogin.accessToken,
      project.id,
      adminLogin.user.id,
      ProjectRole.OWNER,
    );
    expect([403, 409]).toContain(resOwner.status);
  });

  it('members: MEMBER cannot add members', async () => {
    const { user1, user2 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    await addMember(
      adminLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MEMBER,
    ).expect(201);
    const memberLogin = await login(creds.user1.email, creds.user1.password);

    await addMember(
      memberLogin.accessToken,
      project.id,
      user2.id,
      ProjectRole.MEMBER,
    ).expect(403);
  });

  it('roles: OWNER can promote/demote MEMBER to MANAGER; cannot set OWNER', async () => {
    const { user1 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    await addMember(
      adminLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MEMBER,
    ).expect(201);

    const promoted = await updateMemberRole(
      adminLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MANAGER,
    ).expect(200);
    const promotedBody = promoted.body as MemberResponse;
    expect(promotedBody.role).toBe(ProjectRole.MANAGER);

    await updateMemberRole(
      adminLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.OWNER,
    ).expect(403);

    const demoted = await updateMemberRole(
      adminLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MEMBER,
    ).expect(200);
    const demotedBody = demoted.body as MemberResponse;
    expect(demotedBody.role).toBe(ProjectRole.MEMBER);
  });

  it('roles: MANAGER cannot change role of MANAGER (or make someone MANAGER)', async () => {
    const { user1, user2 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

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
    await addMember(
      adminLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MEMBER,
    ).expect(201);

    const managerLogin = await login(creds.user2.email, creds.user2.password);

    await updateMemberRole(
      managerLogin.accessToken,
      project.id,
      user1.id,
      ProjectRole.MANAGER,
    ).expect(403);

    await updateMemberRole(
      managerLogin.accessToken,
      project.id,
      user2.id,
      ProjectRole.MEMBER,
    ).expect(403);
  });

  it('remove: OWNER can remove MEMBER; MANAGER can remove only MEMBER; cannot remove OWNER', async () => {
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

    const managerLogin = await login(creds.user2.email, creds.user2.password);

    await removeMember(managerLogin.accessToken, project.id, user1.id).expect(
      200,
    );

    await removeMember(
      managerLogin.accessToken,
      project.id,
      adminLogin.user.id,
    ).expect(403);

    await removeMember(
      adminLogin.accessToken,
      project.id,
      adminLogin.user.id,
    ).expect(403);
  });

  it('leave: MEMBER can leave; OWNER cannot leave', async () => {
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
    await leaveProject(memberLogin.accessToken, project.id).expect(201);

    const resAgain = await leaveProject(memberLogin.accessToken, project.id);
    expect([404, 403]).toContain(resAgain.status);

    await leaveProject(adminLogin.accessToken, project.id).expect(403);
  });

  it('remove: removing non-existent member -> 404', async () => {
    const { user1 } = await ensureUsers();

    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    await removeMember(adminLogin.accessToken, project.id, user1.id).expect(
      404,
    );
  });
});
