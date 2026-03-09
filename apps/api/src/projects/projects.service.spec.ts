import {
  ForbiddenException,
  PreconditionFailedException,
} from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { ProjectsService } from './projects.service';

describe('ProjectsService', () => {
  const prisma = {
    project: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    projectMember: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const realtime = {
    emitProjectEvent: jest.fn(),
  };
  const audit = {
    log: jest.fn(),
  };
  const workspaceAccess = {
    getRequiredWorkspace: jest.fn(),
  };

  let service: ProjectsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProjectsService(
      prisma as never,
      realtime as never,
      audit as never,
      workspaceAccess as never,
    );
    workspaceAccess.getRequiredWorkspace.mockResolvedValue({
      workspaceId: 'ws_main',
      memberRole: 'ADMIN',
    });
  });

  it('create seeds owner membership and emits side effects', async () => {
    prisma.project.create.mockResolvedValueOnce({
      id: 'p1',
      name: 'Project one',
      ownerId: 'owner',
    });

    const result = await service.create('owner', {
      name: 'Project one',
      description: 'Alpha',
    });

    expect(result).toEqual({
      id: 'p1',
      name: 'Project one',
      ownerId: 'owner',
    });
    expect(prisma.project.create).toHaveBeenCalledWith({
      data: {
        name: 'Project one',
        description: 'Alpha',
        ownerId: 'owner',
        workspaceId: 'ws_main',
        members: {
          create: {
            userId: 'owner',
            role: ProjectRole.OWNER,
          },
        },
      },
    });
    expect(realtime.emitProjectEvent).toHaveBeenCalledWith(
      'p1',
      'project.created',
      expect.objectContaining({
        actorUserId: 'owner',
        name: 'Project one',
        projectId: 'p1',
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PROJECT_CREATE',
        actorUserId: 'owner',
        entityId: 'p1',
        projectId: 'p1',
      }),
    );
  });

  it('update rejects members before touching persistence', async () => {
    prisma.project.findFirst.mockResolvedValueOnce({
      id: 'p1',
      ownerId: 'owner',
    });
    prisma.projectMember.findUnique.mockResolvedValueOnce({
      role: ProjectRole.MEMBER,
    });

    await expect(
      service.update('u1', 'p1', '"3"', {
        name: 'Blocked rename',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.project.updateMany).not.toHaveBeenCalled();
  });

  it('update enforces If-Match version checks', async () => {
    prisma.project.findFirst
      .mockResolvedValueOnce({
        id: 'p1',
        ownerId: 'owner',
      })
      .mockResolvedValueOnce({
        id: 'p1',
        ownerId: 'owner',
        version: 4,
        name: 'Project one',
      });
    prisma.project.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await service.update('owner', 'p1', 'W/"3"', {
      name: 'Renamed',
    });

    expect(prisma.project.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', workspaceId: 'ws_main', version: 3 },
      data: {
        name: 'Renamed',
        version: { increment: 1 },
      },
    });
    expect(result).toEqual({
      id: 'p1',
      ownerId: 'owner',
      version: 4,
      name: 'Project one',
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PROJECT_UPDATE',
        payload: { previousVersion: 3, currentVersion: 4 },
      }),
    );
  });

  it('update throws PreconditionFailedException on version mismatch', async () => {
    prisma.project.findFirst.mockResolvedValueOnce({
      id: 'p1',
      ownerId: 'owner',
    });
    prisma.project.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.update('owner', 'p1', '"2"', {
        description: 'New description',
      }),
    ).rejects.toBeInstanceOf(PreconditionFailedException);
  });

  it('addMember prevents managers from promoting peers', async () => {
    prisma.project.findFirst
      .mockResolvedValueOnce({
        id: 'p1',
        ownerId: 'owner',
      })
      .mockResolvedValueOnce({
        id: 'p1',
        ownerId: 'owner',
      });
    prisma.projectMember.findUnique.mockResolvedValueOnce({
      role: ProjectRole.MANAGER,
    });

    await expect(
      service.addMember('manager-1', 'p1', {
        userId: 'u2',
        role: ProjectRole.MANAGER,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.projectMember.create).not.toHaveBeenCalled();
  });

  it('leave removes a non-owner member and records the action', async () => {
    prisma.project.findFirst.mockResolvedValueOnce({
      id: 'p1',
      ownerId: 'owner',
    });
    prisma.projectMember.findUnique.mockResolvedValueOnce({
      userId: 'u2',
    });

    await expect(service.leave('u2', 'p1')).resolves.toEqual({ ok: true });
    expect(prisma.projectMember.delete).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId: 'p1', userId: 'u2' } },
    });
    expect(realtime.emitProjectEvent).toHaveBeenCalledWith(
      'p1',
      'member.left',
      { userId: 'u2' },
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PROJECT_MEMBER_LEAVE',
        actorUserId: 'u2',
        entityId: 'u2',
        projectId: 'p1',
      }),
    );
  });
});
