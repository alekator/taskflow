import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

type PublicUser = {
  id: string;
  email: string;
  role: string;
  name: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  private signAccessToken(user: { id: string; email: string; role: string }) {
    return this.jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      { secret: process.env.JWT_ACCESS_SECRET!, expiresIn: '15m' },
    );
  }

  private signRefreshToken(user: { id: string }) {
    return this.jwt.sign(
      { sub: user.id },
      { secret: process.env.JWT_REFRESH_SECRET!, expiresIn: '7d' },
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

    const publicUser: PublicUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    return { user: publicUser, accessToken, refreshToken };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwt.verify<{ sub: string }>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET!,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user) throw new UnauthorizedException('Invalid token');

      const accessToken = this.signAccessToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      return { accessToken };
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
