import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
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

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
  ) {
    const access = process.env.JWT_ACCESS_SECRET;
    const refresh = process.env.JWT_REFRESH_SECRET;
    if (!access) throw new Error('JWT_ACCESS_SECRET is not set');
    if (!refresh) throw new Error('JWT_REFRESH_SECRET is not set');
    this.accessSecret = access;
    this.refreshSecret = refresh;
    this.managerInviteCode =
      process.env.AUTH_MANAGER_INVITE_CODE?.trim() ?? null;
    this.adminInviteCode = process.env.AUTH_ADMIN_INVITE_CODE?.trim() ?? null;
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
      },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
      },
    });

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
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

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
