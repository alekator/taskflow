import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
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
      create: jest.fn(),
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
    delete process.env.AUTH_MANAGER_INVITE_CODE;
    delete process.env.AUTH_ADMIN_INVITE_CODE;
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

  it('register creates USER account without invite code', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    (bcrypt.hash as jest.Mock)
      .mockResolvedValueOnce('hashed-password')
      .mockResolvedValueOnce('hashed-jti');
    prisma.user.create.mockResolvedValueOnce({
      id: 'u1',
      email: 'u1@test.com',
      role: UserRole.USER,
      name: 'User One',
    });
    (jwt.sign as jest.Mock)
      .mockReturnValueOnce('access-token')
      .mockReturnValueOnce('refresh-token');
    (jwt.verify as jest.Mock).mockReturnValue({
      sub: 'u1',
      type: 'refresh',
      jti: 'j1',
    });
    prisma.user.update.mockResolvedValueOnce({});

    const result = await service.register({
      email: 'u1@test.com',
      password: '123456',
      role: UserRole.USER,
      name: 'User One',
    });

    expect(result.user.role).toBe(UserRole.USER);
    expect(prisma.user.create).toHaveBeenCalled();
  });

  it('register rejects duplicate email', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' });

    await expect(
      service.register({ email: 'u1@test.com', password: '123456' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('register rejects manager role without invite code', async () => {
    await expect(
      service.register({
        email: 'manager@test.com',
        password: '123456',
        role: UserRole.MANAGER,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('register allows manager role with valid invite code', async () => {
    process.env.AUTH_MANAGER_INVITE_CODE = 'manager-code-123';
    service = new AuthService(prisma as never, jwt, audit as never);

    prisma.user.findUnique.mockResolvedValueOnce(null);
    (bcrypt.hash as jest.Mock)
      .mockResolvedValueOnce('hashed-password')
      .mockResolvedValueOnce('hashed-jti');
    prisma.user.create.mockResolvedValueOnce({
      id: 'm1',
      email: 'manager@test.com',
      role: UserRole.MANAGER,
      name: 'Manager',
    });
    (jwt.sign as jest.Mock)
      .mockReturnValueOnce('access-token')
      .mockReturnValueOnce('refresh-token');
    (jwt.verify as jest.Mock).mockReturnValue({
      sub: 'm1',
      type: 'refresh',
      jti: 'j1',
    });
    prisma.user.update.mockResolvedValueOnce({});

    const result = await service.register({
      email: 'manager@test.com',
      password: '123456',
      role: UserRole.MANAGER,
      inviteCode: 'manager-code-123',
      name: 'Manager',
    });

    expect(result.user.role).toBe(UserRole.MANAGER);
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
