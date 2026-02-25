import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
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
      { sub: user.id, type: 'refresh' as const },
      { secret: this.refreshSecret, expiresIn: '7d' },
    );
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
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash },
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
    let payload: { sub: string; type?: string };

    try {
      payload = this.jwt.verify<{ sub: string; type?: string }>(refreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, refreshTokenHash: true },
    });

    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid token');
    }

    const ok = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!ok) throw new UnauthorizedException('Invalid token');

    const newAccessToken = this.signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    const newRefreshToken = this.signRefreshToken({ id: user.id });
    const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: newRefreshTokenHash },
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(userId: string) {
    await this.prisma.user.updateMany({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });

    return { ok: true };
  }
}
