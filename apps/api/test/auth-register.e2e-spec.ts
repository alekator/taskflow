import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { Server } from 'http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

type AuthPayload = {
  user: { id: string; email: string; role: UserRole; name: string | null };
  accessToken: string;
  refreshToken: string;
};

describe('Auth register (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Server;

  const api = (path: string) => `/api${path}`;
  const testEmails = [
    'register-user@test.com',
    'register-manager@test.com',
    'register-duplicate@test.com',
  ];

  beforeAll(async () => {
    process.env.AUTH_MANAGER_INVITE_CODE = 'manager-code-e2e';
    process.env.AUTH_ADMIN_INVITE_CODE = 'admin-code-e2e';

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
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('registers USER without invite and can login only after registration', async () => {
    await request(server)
      .post(api('/auth/login'))
      .send({ email: testEmails[0], password: '123456' })
      .expect(401);

    const registerRes = await request(server)
      .post(api('/auth/register'))
      .send({
        email: testEmails[0],
        password: '123456',
        name: 'User Registered',
      })
      .expect(201);

    const registerBody = registerRes.body as AuthPayload;
    expect(registerBody.user.email).toBe(testEmails[0]);
    expect(registerBody.user.role).toBe(UserRole.USER);
    expect(registerBody.accessToken).toBeTruthy();
    expect(registerBody.refreshToken).toBeTruthy();

    const loginRes = await request(server)
      .post(api('/auth/login'))
      .send({ email: testEmails[0], password: '123456' })
      .expect(201);

    const loginBody = loginRes.body as AuthPayload;
    expect(loginBody.user.email).toBe(testEmails[0]);
    expect(loginBody.user.role).toBe(UserRole.USER);
  });

  it('rejects duplicate registration', async () => {
    await request(server)
      .post(api('/auth/register'))
      .send({
        email: testEmails[2],
        password: '123456',
        name: 'Duplicate User',
      })
      .expect(201);

    await request(server)
      .post(api('/auth/register'))
      .send({
        email: testEmails[2],
        password: '123456',
        name: 'Duplicate User Again',
      })
      .expect(409);
  });

  it('requires invite code for MANAGER registration and accepts valid one', async () => {
    await request(server)
      .post(api('/auth/register'))
      .send({
        email: testEmails[1],
        password: '123456',
        role: 'MANAGER',
      })
      .expect(403);

    const ok = await request(server)
      .post(api('/auth/register'))
      .send({
        email: testEmails[1],
        password: '123456',
        role: 'MANAGER',
        inviteCode: 'manager-code-e2e',
      })
      .expect(201);

    const body = ok.body as AuthPayload;
    expect(body.user.role).toBe(UserRole.MANAGER);
  });
});
