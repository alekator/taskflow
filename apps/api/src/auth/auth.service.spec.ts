import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const jwt = {
    sign: jest.fn(),
    verify: jest.fn(),
  } as unknown as JwtService;
  const audit = {
    log: jest.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_ACCESS_SECRET = 'access-secret-123456';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret-123456';
    service = new AuthService(prisma as never, jwt, audit as never);
  });

  it('login throws Unauthorized when user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.login('missing@test.com', '123456'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login returns access/refresh pair for valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      email: 'u1@test.com',
      role: UserRole.USER,
      name: 'User',
      passwordHash: 'hash',
    });
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    (jwt.sign as jest.Mock)
      .mockReturnValueOnce('access-token')
      .mockReturnValueOnce('refresh-token');
    (jwt.verify as jest.Mock).mockReturnValue({
      sub: 'u1',
      type: 'refresh',
      jti: 'j1',
    });
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-jti');
    prisma.user.update.mockResolvedValueOnce({});

    const result = await service.login('u1@test.com', '123456');

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
    expect(result.user.id).toBe('u1');
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('refresh throws Unauthorized when token verification fails', async () => {
    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error('invalid');
    });

    await expect(service.refresh('bad-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('logout clears refresh token hash', async () => {
    prisma.user.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(service.logout('u1')).resolves.toEqual({ ok: true });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { refreshJtiHash: null },
    });
  });
});
