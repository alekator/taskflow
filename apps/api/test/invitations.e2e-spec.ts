import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WorkspaceInvitationStatus } from '@prisma/client';
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

describe('Workspace Invitations (e2e)', () => {
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
      email: 'member.invites@test.com',
      password: '123456',
      name: 'Member',
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
        update: { role: u.role, name: u.name, passwordHash },
        create: {
          email: u.email,
          role: u.role,
          name: u.name,
          passwordHash,
        },
      });
    }
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
    await prisma.workspaceInvitation.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
  });

  afterAll(async () => {
    await prisma.workspaceInvitation.deleteMany();
    await app.close();
  });

  it('workspace admin can create and list invitations', async () => {
    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const inviteEmail = `invited.${Date.now()}@test.com`;

    const created = await request(server)
      .post(api('/workspace-invitations'))
      .set('Authorization', `Bearer ${adminLogin.accessToken}`)
      .send({
        email: inviteEmail,
        role: 'MEMBER',
        expiresInDays: 5,
      })
      .expect(201);

    const createdBody = created.body as {
      id: string;
      email: string;
      status: WorkspaceInvitationStatus;
      inviteToken: string;
      inviteLink: string;
    };
    expect(createdBody.email).toBe(inviteEmail);
    expect(createdBody.status).toBe(WorkspaceInvitationStatus.PENDING);
    expect(createdBody.inviteToken).toBeTruthy();
    expect(createdBody.inviteLink).toContain(createdBody.inviteToken);

    const listed = await request(server)
      .get(api('/workspace-invitations'))
      .set('Authorization', `Bearer ${adminLogin.accessToken}`)
      .expect(200);

    const listBody = listed.body as {
      items: Array<{
        id: string;
        email: string;
        status: WorkspaceInvitationStatus;
      }>;
    };
    expect(listBody.items.some((item) => item.id === createdBody.id)).toBe(
      true,
    );
  });

  it('non-admin workspace user cannot create invitation', async () => {
    const memberLogin = await login(creds.member.email, creds.member.password);

    await request(server)
      .post(api('/workspace-invitations'))
      .set('Authorization', `Bearer ${memberLogin.accessToken}`)
      .send({
        email: `blocked.${Date.now()}@test.com`,
      })
      .expect(403);
  });

  it('register with invite token joins invited workspace and marks invite accepted', async () => {
    const adminLogin = await login(creds.admin.email, creds.admin.password);
    const invitedEmail = `accepted.${Date.now()}@test.com`;

    const inviteRes = await request(server)
      .post(api('/workspace-invitations'))
      .set('Authorization', `Bearer ${adminLogin.accessToken}`)
      .send({
        email: invitedEmail,
        role: 'MEMBER',
      })
      .expect(201);

    const inviteToken = (inviteRes.body as { inviteToken: string; id: string })
      .inviteToken;
    const invitationId = (inviteRes.body as { inviteToken: string; id: string })
      .id;

    const registerRes = await request(server)
      .post(api('/auth/register'))
      .send({
        email: invitedEmail,
        password: '123456',
        name: 'Invited User',
        inviteToken,
      })
      .expect(201);

    const createdUser = registerRes.body as {
      user: { id: string; email: string };
    };
    expect(createdUser.user.email).toBe(invitedEmail);

    const userRow = await prisma.user.findUnique({
      where: { email: invitedEmail },
      select: { id: true, defaultWorkspaceId: true },
    });
    expect(userRow?.defaultWorkspaceId).toBeTruthy();

    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: userRow?.defaultWorkspaceId ?? '',
          userId: userRow?.id ?? '',
        },
      },
      select: { userId: true },
    });
    expect(member?.userId).toBe(userRow?.id);

    const invite = await prisma.workspaceInvitation.findUnique({
      where: { id: invitationId },
      select: { status: true, acceptedAt: true },
    });
    expect(invite?.status).toBe(WorkspaceInvitationStatus.ACCEPTED);
    expect(invite?.acceptedAt).toBeTruthy();
  });

  it('register rejects invite token when email does not match invitation', async () => {
    const adminLogin = await login(creds.admin.email, creds.admin.password);

    const inviteRes = await request(server)
      .post(api('/workspace-invitations'))
      .set('Authorization', `Bearer ${adminLogin.accessToken}`)
      .send({
        email: `target.${Date.now()}@test.com`,
      })
      .expect(201);

    const inviteToken = (inviteRes.body as { inviteToken: string }).inviteToken;

    await request(server)
      .post(api('/auth/register'))
      .send({
        email: `wrong.${Date.now()}@test.com`,
        password: '123456',
        name: 'Wrong Email',
        inviteToken,
      })
      .expect(403);
  });
});
