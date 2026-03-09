import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole, WorkspaceMemberRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { InvitationsService } from '../invitations/invitations.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';

type PublicUser = {
  id: string;
  email: string;
  role: UserRole;
  name: string | null;
};

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly managerInviteCode: string | null;
  private readonly adminInviteCode: string | null;
  private readonly mainWorkspaceSlug = 'main';
  private readonly mainWorkspaceId = 'ws_main';
  private readonly loginMaxAttempts: number;
  private readonly loginLockMinutes: number;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
    private invitations: InvitationsService,
  ) {
    // Validate secrets on boot so auth fails loudly during startup instead of
    // producing hard-to-debug token errors later at request time.
    const access = process.env.JWT_ACCESS_SECRET;
    const refresh = process.env.JWT_REFRESH_SECRET;
    if (!access) throw new Error('JWT_ACCESS_SECRET is not set');
    if (!refresh) throw new Error('JWT_REFRESH_SECRET is not set');
    this.accessSecret = access;
    this.refreshSecret = refresh;
    this.managerInviteCode =
      process.env.AUTH_MANAGER_INVITE_CODE?.trim() ?? null;
    this.adminInviteCode = process.env.AUTH_ADMIN_INVITE_CODE?.trim() ?? null;

    const maxAttempts = Number.parseInt(
      process.env.AUTH_LOGIN_MAX_ATTEMPTS ?? '5',
      10,
    );
    const lockMinutes = Number.parseInt(
      process.env.AUTH_LOGIN_LOCK_MINUTES ?? '15',
      10,
    );
    this.loginMaxAttempts =
      Number.isInteger(maxAttempts) && maxAttempts > 0 ? maxAttempts : 5;
    this.loginLockMinutes =
      Number.isInteger(lockMinutes) && lockMinutes > 0 ? lockMinutes : 15;
  }

  private workspaceRoleForUser(role: UserRole): WorkspaceMemberRole {
    return role === UserRole.ADMIN
      ? WorkspaceMemberRole.ADMIN
      : WorkspaceMemberRole.MEMBER;
  }

  private async ensureMainWorkspaceMembership(user: {
    id: string;
    role: UserRole;
    defaultWorkspaceId?: string | null;
  }) {
    const workspace = await this.prisma.workspace.upsert({
      where: { slug: this.mainWorkspaceSlug },
      update: {},
      create: {
        id: this.mainWorkspaceId,
        slug: this.mainWorkspaceSlug,
        name: 'TaskFlow Main Workspace',
      },
      select: { id: true },
    });

    const workspaceRole = this.workspaceRoleForUser(user.role);
    await this.prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: user.id,
        },
      },
      update: {
        role: workspaceRole,
      },
      create: {
        workspaceId: workspace.id,
        userId: user.id,
        role: workspaceRole,
      },
    });

    if (user.defaultWorkspaceId !== workspace.id) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { defaultWorkspaceId: workspace.id },
      });
    }

    return workspace.id;
  }

  private async ensureAnyWorkspaceMembership(user: {
    id: string;
    role: UserRole;
    defaultWorkspaceId?: string | null;
  }) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { workspaceId: true },
    });

    if (!membership) {
      await this.ensureMainWorkspaceMembership(user);
      return;
    }

    if (user.defaultWorkspaceId !== membership.workspaceId) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { defaultWorkspaceId: membership.workspaceId },
      });
    }
  }

  private signAccessToken(user: { id: string; email: string; role: UserRole }) {
    return this.jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      { secret: this.accessSecret, expiresIn: '15m' },
    );
  }

  private signRefreshToken(user: { id: string }) {
    return this.jwt.sign(
      { sub: user.id, type: 'refresh' as const, jti: randomUUID() },
      { secret: this.refreshSecret, expiresIn: '7d' },
    );
  }

  private verifyRefreshToken(refreshToken: string): {
    sub: string;
    type: 'refresh';
    jti: string;
  } {
    let payload: unknown;

    try {
      payload = this.jwt.verify(refreshToken, { secret: this.refreshSecret });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const p = payload as { sub?: string; type?: string; jti?: string };

    // Refresh tokens are deliberately stricter than access tokens because they
    // control long-lived session renewal.
    if (!p.sub || p.type !== 'refresh' || !p.jti) {
      throw new UnauthorizedException('Invalid token');
    }

    return { sub: p.sub, type: 'refresh', jti: p.jti };
  }

  private getRequestedRole(input: RegisterDto): UserRole {
    return input.role ?? UserRole.USER;
  }

  private ensureInviteForRole(role: UserRole, inviteCode?: string) {
    if (role === UserRole.USER) return;

    const expectedCode =
      role === UserRole.ADMIN ? this.adminInviteCode : this.managerInviteCode;

    if (!expectedCode || inviteCode !== expectedCode) {
      throw new ForbiddenException(
        `${role} registration requires a valid invite code`,
      );
    }
  }

  private async buildSession(user: {
    id: string;
    email: string;
    role: UserRole;
    name: string | null;
  }) {
    const accessToken = this.signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = this.signRefreshToken({ id: user.id });
    const { jti } = this.verifyRefreshToken(refreshToken);
    const refreshJtiHash = await bcrypt.hash(jti, 10);

    // Store only the refresh token identifier hash. That keeps refresh tokens
    // one-time rotatable without persisting the raw token server-side.
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshJtiHash,
        refreshTokenHash: null,
      },
    });

    const publicUser: PublicUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    return { user: publicUser, accessToken, refreshToken };
  }

  async register(input: RegisterDto) {
    const email = input.email.trim().toLowerCase();
    const invitation = await this.invitations.consumeForRegistration(
      email,
      input.inviteToken,
    );
    const requestedRole = this.getRequestedRole(input);

    this.ensureInviteForRole(requestedRole, input.inviteCode);

    const exists = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (exists) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const created = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        role: requestedRole,
        name: input.name?.trim() || null,
        defaultWorkspaceId: invitation?.workspaceId ?? null,
      },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        defaultWorkspaceId: true,
      },
    });

    if (invitation) {
      await this.prisma.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: invitation.workspaceId,
            userId: created.id,
          },
        },
        update: { role: invitation.role },
        create: {
          workspaceId: invitation.workspaceId,
          userId: created.id,
          role: invitation.role,
        },
      });
      await this.invitations.accept(invitation.id, created.id);
    } else {
      await this.ensureMainWorkspaceMembership(created);
    }

    const session = await this.buildSession(created);

    await this.audit.log({
      action: 'AUTH_REGISTER',
      actorUserId: created.id,
      entityType: 'user',
      entityId: created.id,
      payload: { email: created.email, role: created.role },
    });

    return session;
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        passwordHash: true,
        defaultWorkspaceId: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.audit.log({
        action: 'AUTH_LOGIN_LOCKED',
        actorUserId: user.id,
        entityType: 'user',
        entityId: user.id,
      });
      throw new ForbiddenException(
        'Too many failed login attempts. Try again later.',
      );
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const nextFailedAttempts = user.failedLoginAttempts + 1;
      const shouldLock = nextFailedAttempts >= this.loginMaxAttempts;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: shouldLock ? 0 : nextFailedAttempts,
          lockedUntil: shouldLock
            ? new Date(Date.now() + this.loginLockMinutes * 60_000)
            : null,
        },
      });

      await this.audit.log({
        action: shouldLock ? 'AUTH_LOGIN_LOCKED' : 'AUTH_LOGIN_FAILED',
        actorUserId: user.id,
        entityType: 'user',
        entityId: user.id,
        payload: {
          failedAttempts: nextFailedAttempts,
          lockMinutes: shouldLock ? this.loginLockMinutes : undefined,
        },
      });

      if (shouldLock) {
        throw new ForbiddenException(
          'Too many failed login attempts. Try again later.',
        );
      }

      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    }

    await this.ensureAnyWorkspaceMembership(user);

    const session = await this.buildSession({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    await this.audit.log({
      action: 'AUTH_LOGIN',
      actorUserId: user.id,
      entityType: 'user',
      entityId: user.id,
      payload: { email: user.email },
    });

    return session;
  }

  async refresh(refreshToken: string) {
    const payload = this.verifyRefreshToken(refreshToken);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, refreshJtiHash: true },
    });

    if (!user?.refreshJtiHash) {
      throw new UnauthorizedException('Invalid token');
    }

    const ok = await bcrypt.compare(payload.jti, user.refreshJtiHash);
    if (!ok) throw new UnauthorizedException('Invalid token');

    // Rotate the refresh JTI on every refresh so a stolen old token cannot be
    // replayed after the user has already renewed the session.
    const newAccessToken = this.signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    const newRefreshToken = this.signRefreshToken({ id: user.id });
    const newPayload = this.verifyRefreshToken(newRefreshToken);
    const newRefreshJtiHash = await bcrypt.hash(newPayload.jti, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshJtiHash: newRefreshJtiHash },
    });

    await this.audit.log({
      action: 'AUTH_REFRESH',
      actorUserId: user.id,
      entityType: 'user',
      entityId: user.id,
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(userId: string) {
    await this.prisma.user.updateMany({
      where: { id: userId },
      data: { refreshJtiHash: null },
    });

    await this.audit.log({
      action: 'AUTH_LOGOUT',
      actorUserId: userId,
      entityType: 'user',
      entityId: userId,
    });

    return { ok: true };
  }
}
