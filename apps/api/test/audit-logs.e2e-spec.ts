import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { Server } from 'http';
import request from 'supertest';
import type { Test as SupertestTest } from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type LoginResponse = {
  user: { id: string; email: string; role: string; name: string | null };
  accessToken: string;
  refreshToken: string;
};

describe('Audit Logs (e2e)', () => {
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
  }

  async function createProject(
    accessToken: string,
    name: string,
  ): Promise<void> {
    await request(server)
      .post(api('/projects'))
      .set(authHeader(accessToken))
      .send({
        name,
        description: 'Audit e2e project',
      })
      .expect(201);
  }

  function listAuditLogs(
    accessToken: string,
    query?: Record<string, string | number>,
  ): SupertestTest {
    const req = request(server)
      .get(api('/audit-logs'))
      .set(authHeader(accessToken));
    if (query) req.query(query);
    return req;
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

  it('ADMIN can list audit logs and see project creation action', async () => {
    const adminLogin = await login(creds.admin.email, creds.admin.password);
    await createProject(adminLogin.accessToken, 'Audit Project');

    const res = await listAuditLogs(adminLogin.accessToken, {
      action: 'PROJECT_CREATE',
      page: 1,
      limit: 20,
    }).expect(200);

    const body = res.body as {
      items: Array<{ action: string; actorUserId: string; entityType: string }>;
      meta: { total: number };
    };

    expect(body.meta.total).toBeGreaterThanOrEqual(1);
    expect(body.items[0].action).toBe('PROJECT_CREATE');
    expect(body.items[0].entityType).toBe('project');
    expect(body.items[0].actorUserId).toBe(adminLogin.user.id);
  });

  it('non-admin cannot list audit logs', async () => {
    const adminLogin = await login(creds.admin.email, creds.admin.password);
    await createProject(adminLogin.accessToken, 'Audit Forbidden');

    const userLogin = await login(creds.user1.email, creds.user1.password);
    await listAuditLogs(userLogin.accessToken).expect(403);
  });
});
