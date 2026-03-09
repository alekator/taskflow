import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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

describe('Async Jobs (e2e)', () => {
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
    user: {
      email: 'jobs.user@test.com',
      password: '123456',
      name: 'Jobs User',
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
    await prisma.asyncJob.deleteMany();
    await prisma.workspaceInvitation.deleteMany();
    await prisma.auditLog.deleteMany({
      where: {
        action: {
          in: ['WORKSPACE_INVITATION_EMAIL_DISPATCHED'],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.asyncJob.deleteMany();
    await app.close();
  });

  it('only ADMIN can run jobs manually', async () => {
    const admin = await login(creds.admin.email, creds.admin.password);
    const user = await login(creds.user.email, creds.user.password);

    await request(server)
      .post(api('/async-jobs/run-once'))
      .set(authHeader(user.accessToken))
      .expect(403);

    await request(server)
      .post(api('/async-jobs/run-once'))
      .set(authHeader(admin.accessToken))
      .expect(201);
  });

  it('invitation creation enqueues email job and run-once processes it', async () => {
    const admin = await login(creds.admin.email, creds.admin.password);

    const created = await request(server)
      .post(api('/workspace-invitations'))
      .set(authHeader(admin.accessToken))
      .send({ email: `jobs.invitee.${Date.now()}@test.com` })
      .expect(201);

    const invitationId = (created.body as { id: string }).id;
    const queued = await prisma.asyncJob.findMany({
      where: { type: 'SEND_WORKSPACE_INVITE_EMAIL', status: 'PENDING' },
    });
    expect(queued.length).toBeGreaterThanOrEqual(1);

    const run = await request(server)
      .post(api('/async-jobs/run-once'))
      .set(authHeader(admin.accessToken))
      .expect(201);
    const runBody = run.body as {
      claimed: number;
      succeeded: number;
    };
    expect(runBody.claimed).toBeGreaterThanOrEqual(1);
    expect(runBody.succeeded).toBeGreaterThanOrEqual(1);

    const processed = await prisma.asyncJob.findFirst({
      where: {
        type: 'SEND_WORKSPACE_INVITE_EMAIL',
        dedupeKey: `invite-email:${invitationId}`,
      },
      select: { status: true, processedAt: true },
    });

    expect(processed?.status).toBe('SUCCEEDED');
    expect(processed?.processedAt).toBeTruthy();

    const dispatchedAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'WORKSPACE_INVITATION_EMAIL_DISPATCHED',
        entityId: invitationId,
      },
      select: {
        id: true,
        payload: true,
      },
    });
    expect(dispatchedAudit).toBeTruthy();
    const payload =
      dispatchedAudit?.payload &&
      typeof dispatchedAudit.payload === 'object' &&
      !Array.isArray(dispatchedAudit.payload)
        ? (dispatchedAudit.payload as Record<string, unknown>)
        : null;
    expect(payload?.delivery).toBe('simulated');
  });

  it('failed job is retried and eventually marked FAILED', async () => {
    const admin = await login(creds.admin.email, creds.admin.password);

    const forced = await prisma.asyncJob.create({
      data: {
        type: 'SEND_WORKSPACE_INVITE_EMAIL',
        status: 'PENDING',
        runAt: new Date(),
        maxAttempts: 2,
        payload: {
          invitationId: 'inv-force-fail',
          email: 'force.fail@test.com',
          inviteLink: 'http://localhost/invite',
          requestedByUserId: admin.user.id,
          forceFail: true,
        },
      },
      select: { id: true },
    });

    const first = await request(server)
      .post(api('/async-jobs/run-once'))
      .set(authHeader(admin.accessToken))
      .expect(201);
    expect((first.body as { retried: number }).retried).toBeGreaterThanOrEqual(
      1,
    );

    await prisma.asyncJob.update({
      where: { id: forced.id },
      data: { runAt: new Date() },
    });

    const second = await request(server)
      .post(api('/async-jobs/run-once'))
      .set(authHeader(admin.accessToken))
      .expect(201);
    expect((second.body as { failed: number }).failed).toBeGreaterThanOrEqual(
      1,
    );

    const final = await prisma.asyncJob.findUnique({
      where: { id: forced.id },
      select: { status: true, attempts: true, lastError: true },
    });
    expect(final?.status).toBe('FAILED');
    expect(final?.attempts).toBe(2);
    expect(final?.lastError).toContain('Forced failure');
  });
});
