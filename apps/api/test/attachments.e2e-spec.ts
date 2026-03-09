import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ProjectRole } from '@prisma/client';
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

describe('Attachments (e2e)', () => {
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
      email: 'attach.user1@test.com',
      password: '123456',
      name: 'Attach User One',
      role: 'USER' as const,
    },
    user2: {
      email: 'attach.user2@test.com',
      password: '123456',
      name: 'Attach User Two',
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

    if (!admin || !user1 || !user2) throw new Error('Failed to ensure users');
    return { admin, user1, user2 };
  }

  async function cleanDb() {
    await prisma.projectAttachment.deleteMany();
    await prisma.taskAttachment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
  }

  async function createProject(accessToken: string, name = 'Attachments Project') {
    const res = await request(server)
      .post(api('/projects'))
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name, description: 'Attachment e2e project' })
      .expect(201);
    return res.body as { id: string };
  }

  async function createTask(accessToken: string, projectId: string, title = 'Task for attachments') {
    const res = await request(server)
      .post(api(`/projects/${projectId}/tasks`))
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title })
      .expect(201);
    return res.body as { id: string };
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
    await cleanDb();
  });

  afterAll(async () => {
    await cleanDb();
    await app.close();
  });

  it('supports upload intent -> complete -> list -> delete flow with permissions', async () => {
    const { user1, user2 } = await ensureUsers();
    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken);

    await request(server)
      .post(api(`/projects/${project.id}/members`))
      .set('Authorization', `Bearer ${adminLogin.accessToken}`)
      .send({ userId: user1.id, role: ProjectRole.MEMBER })
      .expect(201);

    await request(server)
      .post(api(`/projects/${project.id}/members`))
      .set('Authorization', `Bearer ${adminLogin.accessToken}`)
      .send({ userId: user2.id, role: ProjectRole.MEMBER })
      .expect(201);

    const memberOneLogin = await login(creds.user1.email, creds.user1.password);
    const memberTwoLogin = await login(creds.user2.email, creds.user2.password);

    const task = await createTask(memberOneLogin.accessToken, project.id);

    const uploadIntent = await request(server)
      .post(api(`/tasks/${task.id}/attachments/uploads`))
      .set('Authorization', `Bearer ${memberOneLogin.accessToken}`)
      .send({
        fileName: 'release-notes.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
      })
      .expect(201);

    const uploadBody = uploadIntent.body as {
      attachment: { id: string; status: string };
      upload: { uploadUrl: string };
      uploadToken: string;
    };
    expect(uploadBody.attachment.status).toBe('PENDING');
    expect(uploadBody.upload.uploadUrl).toContain(uploadBody.attachment.id);

    await request(server)
      .post(api(`/tasks/${task.id}/attachments/${uploadBody.attachment.id}/complete`))
      .set('Authorization', `Bearer ${memberOneLogin.accessToken}`)
      .send({ uploadToken: 'wrong-token-value' })
      .expect(403);

    await request(server)
      .post(api(`/tasks/${task.id}/attachments/${uploadBody.attachment.id}/complete`))
      .set('Authorization', `Bearer ${memberOneLogin.accessToken}`)
      .send({ uploadToken: uploadBody.uploadToken })
      .expect(201);

    const listed = await request(server)
      .get(api(`/tasks/${task.id}/attachments`))
      .set('Authorization', `Bearer ${memberOneLogin.accessToken}`)
      .expect(200);
    const listedItems = listed.body as Array<{ id: string; status: string }>;
    expect(listedItems).toHaveLength(1);
    expect(listedItems[0].id).toBe(uploadBody.attachment.id);
    expect(listedItems[0].status).toBe('AVAILABLE');

    await request(server)
      .delete(api(`/tasks/${task.id}/attachments/${uploadBody.attachment.id}`))
      .set('Authorization', `Bearer ${memberTwoLogin.accessToken}`)
      .expect(403);

    await request(server)
      .delete(api(`/tasks/${task.id}/attachments/${uploadBody.attachment.id}`))
      .set('Authorization', `Bearer ${adminLogin.accessToken}`)
      .expect(200);

    const afterDelete = await request(server)
      .get(api(`/tasks/${task.id}/attachments`))
      .set('Authorization', `Bearer ${memberOneLogin.accessToken}`)
      .expect(200);
    expect(afterDelete.body).toEqual([]);
  });

  it('hides attachment endpoints from non-members', async () => {
    const { user1, user2 } = await ensureUsers();
    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const project = await createProject(adminLogin.accessToken, 'Attachment Visibility');

    await request(server)
      .post(api(`/projects/${project.id}/members`))
      .set('Authorization', `Bearer ${adminLogin.accessToken}`)
      .send({ userId: user1.id, role: ProjectRole.MEMBER })
      .expect(201);

    const memberLogin = await login(creds.user1.email, creds.user1.password);
    const outsiderLogin = await login(creds.user2.email, creds.user2.password);
    const task = await createTask(memberLogin.accessToken, project.id, 'Task visibility');

    await request(server)
      .get(api(`/tasks/${task.id}/attachments`))
      .set('Authorization', `Bearer ${outsiderLogin.accessToken}`)
      .expect(404);
  });

  it('supports project attachment upload intent -> complete -> list -> delete', async () => {
    const { user1, user2 } = await ensureUsers();
    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const memberOneLogin = await login(creds.user1.email, creds.user1.password);
    const memberTwoLogin = await login(creds.user2.email, creds.user2.password);
    const project = await createProject(adminLogin.accessToken, 'Project Attachments');

    await request(server)
      .post(api(`/projects/${project.id}/members`))
      .set('Authorization', `Bearer ${adminLogin.accessToken}`)
      .send({ userId: user1.id, role: ProjectRole.MEMBER })
      .expect(201);

    await request(server)
      .post(api(`/projects/${project.id}/members`))
      .set('Authorization', `Bearer ${adminLogin.accessToken}`)
      .send({ userId: user2.id, role: ProjectRole.MEMBER })
      .expect(201);

    const uploadIntent = await request(server)
      .post(api(`/projects/${project.id}/attachments/uploads`))
      .set('Authorization', `Bearer ${memberOneLogin.accessToken}`)
      .send({
        fileName: 'project-brief.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4096,
      })
      .expect(201);

    const uploadBody = uploadIntent.body as {
      attachment: { id: string; status: string };
      upload: { uploadUrl: string };
      uploadToken: string;
    };
    expect(uploadBody.attachment.status).toBe('PENDING');
    expect(uploadBody.upload.uploadUrl).toContain(uploadBody.attachment.id);

    await request(server)
      .post(
        api(
          `/projects/${project.id}/attachments/${uploadBody.attachment.id}/complete`,
        ),
      )
      .set('Authorization', `Bearer ${memberOneLogin.accessToken}`)
      .send({ uploadToken: uploadBody.uploadToken })
      .expect(201);

    const listed = await request(server)
      .get(api(`/projects/${project.id}/attachments`))
      .set('Authorization', `Bearer ${memberOneLogin.accessToken}`)
      .expect(200);
    const listedItems = listed.body as Array<{ id: string; status: string }>;
    expect(listedItems).toHaveLength(1);
    expect(listedItems[0].id).toBe(uploadBody.attachment.id);
    expect(listedItems[0].status).toBe('AVAILABLE');

    await request(server)
      .delete(api(`/projects/${project.id}/attachments/${uploadBody.attachment.id}`))
      .set('Authorization', `Bearer ${memberTwoLogin.accessToken}`)
      .expect(403);

    await request(server)
      .delete(api(`/projects/${project.id}/attachments/${uploadBody.attachment.id}`))
      .set('Authorization', `Bearer ${adminLogin.accessToken}`)
      .expect(200);

    const afterDelete = await request(server)
      .get(api(`/projects/${project.id}/attachments`))
      .set('Authorization', `Bearer ${memberOneLogin.accessToken}`)
      .expect(200);
    expect(afterDelete.body).toEqual([]);
  });

  it('hides project attachment endpoints from non-members', async () => {
    const { user1 } = await ensureUsers();
    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const outsiderLogin = await login(creds.user2.email, creds.user2.password);
    const project = await createProject(
      adminLogin.accessToken,
      'Project Attachments Visibility',
    );

    await request(server)
      .post(api(`/projects/${project.id}/members`))
      .set('Authorization', `Bearer ${adminLogin.accessToken}`)
      .send({ userId: user1.id, role: ProjectRole.MEMBER })
      .expect(201);

    await request(server)
      .get(api(`/projects/${project.id}/attachments`))
      .set('Authorization', `Bearer ${outsiderLogin.accessToken}`)
      .expect(404);
  });
});
