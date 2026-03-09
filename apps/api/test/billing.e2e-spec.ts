import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BillingProvider, WorkspaceSubscriptionStatus } from '@prisma/client';
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

describe('Billing (e2e)', () => {
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
    member: {
      email: 'member.billing@test.com',
      password: '123456',
      name: 'Billing Member',
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
        create: {
          email: u.email,
          name: u.name,
          role: u.role,
          passwordHash,
        },
      });
    }
  }

  beforeAll(async () => {
    process.env.BILLING_WEBHOOK_SECRET = 'billing-secret-test';

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
    await prisma.workspaceBillingEvent.deleteMany();
    await prisma.workspaceBilling.deleteMany();
  });

  afterAll(async () => {
    await prisma.workspaceBillingEvent.deleteMany();
    await prisma.workspaceBilling.deleteMany();
    delete process.env.BILLING_WEBHOOK_SECRET;
    await app.close();
  });

  it('returns default workspace subscription for authenticated user', async () => {
    const adminLogin = await login(creds.admin.email, creds.admin.password);

    const res = await request(server)
      .get(api('/billing/subscription'))
      .set('Authorization', `Bearer ${adminLogin.accessToken}`)
      .expect(200);

    const body = res.body as {
      provider: BillingProvider;
      status: WorkspaceSubscriptionStatus;
      planCode: string;
      seats: number;
    };

    expect(body.provider).toBe(BillingProvider.NONE);
    expect(body.status).toBe(WorkspaceSubscriptionStatus.TRIALING);
    expect(body.planCode).toBe('free');
    expect(body.seats).toBe(1);
  });

  it('allows only workspace admin to create checkout session', async () => {
    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const memberLogin = await login(creds.member.email, creds.member.password);

    await request(server)
      .post(api('/billing/checkout-session'))
      .set('Authorization', `Bearer ${memberLogin.accessToken}`)
      .send({ planCode: 'pro', seats: 3 })
      .expect(403);

    const created = await request(server)
      .post(api('/billing/checkout-session'))
      .set('Authorization', `Bearer ${adminLogin.accessToken}`)
      .send({ planCode: 'pro', seats: 3 })
      .expect(201);

    const body = created.body as {
      checkoutSessionId: string;
      status: string;
      checkoutUrl: string;
    };
    expect(body.checkoutSessionId).toBeTruthy();
    expect(body.status).toBe('PENDING');
    expect(body.checkoutUrl).toContain(body.checkoutSessionId);
  });

  it('processes webhook updates and deduplicates same event id', async () => {
    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const subscription = await request(server)
      .get(api('/billing/subscription'))
      .set('Authorization', `Bearer ${adminLogin.accessToken}`)
      .expect(200);
    const workspaceId = (subscription.body as { workspaceId: string }).workspaceId;

    const payload = {
      provider: BillingProvider.STRIPE,
      eventId: 'evt_billing_001',
      type: 'customer.subscription.updated',
      workspaceId,
      providerCustomerId: 'cus_123',
      providerSubscriptionId: 'sub_123',
      status: WorkspaceSubscriptionStatus.ACTIVE,
      planCode: 'pro',
      seats: 7,
      currentPeriodStart: '2026-03-01T00:00:00.000Z',
      currentPeriodEnd: '2026-04-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      payload: { source: 'test' },
    };

    const first = await request(server)
      .post(api('/billing/webhooks/provider'))
      .set('x-billing-webhook-secret', 'billing-secret-test')
      .send(payload)
      .expect(202);
    expect((first.body as { deduplicated: boolean }).deduplicated).toBe(false);

    const second = await request(server)
      .post(api('/billing/webhooks/provider'))
      .set('x-billing-webhook-secret', 'billing-secret-test')
      .send(payload)
      .expect(202);
    expect((second.body as { deduplicated: boolean }).deduplicated).toBe(true);

    const updated = await request(server)
      .get(api('/billing/subscription'))
      .set('Authorization', `Bearer ${adminLogin.accessToken}`)
      .expect(200);
    const updatedBody = updated.body as {
      provider: BillingProvider;
      status: WorkspaceSubscriptionStatus;
      planCode: string;
      seats: number;
      providerSubscriptionId: string | null;
    };
    expect(updatedBody.provider).toBe(BillingProvider.STRIPE);
    expect(updatedBody.status).toBe(WorkspaceSubscriptionStatus.ACTIVE);
    expect(updatedBody.planCode).toBe('pro');
    expect(updatedBody.seats).toBe(7);
    expect(updatedBody.providerSubscriptionId).toBe('sub_123');
  });

  it('rejects provider webhook with invalid secret', async () => {
    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const subscription = await request(server)
      .get(api('/billing/subscription'))
      .set('Authorization', `Bearer ${adminLogin.accessToken}`)
      .expect(200);
    const workspaceId = (subscription.body as { workspaceId: string }).workspaceId;

    await request(server)
      .post(api('/billing/webhooks/provider'))
      .set('x-billing-webhook-secret', 'wrong-secret')
      .send({
        provider: BillingProvider.STRIPE,
        eventId: 'evt_wrong_secret',
        type: 'customer.subscription.updated',
        workspaceId,
      })
      .expect(403);
  });
});
