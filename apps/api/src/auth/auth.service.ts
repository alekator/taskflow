import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

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

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {
    const access = process.env.JWT_ACCESS_SECRET;
    const refresh = process.env.JWT_REFRESH_SECRET;
    if (!access) throw new Error('JWT_ACCESS_SECRET is not set');
    if (!refresh) throw new Error('JWT_REFRESH_SECRET is not set');
    this.accessSecret = access;
    this.refreshSecret = refresh;
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

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

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

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(userId: string) {
    await this.prisma.user.updateMany({
      where: { id: userId },
      data: { refreshJtiHash: null },
    });

    return { ok: true };
  }
}
