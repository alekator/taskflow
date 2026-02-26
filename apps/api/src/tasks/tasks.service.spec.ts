import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectRole, TaskPriority, TaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  const prisma = {
    project: {
      findUnique: jest.fn(),
    },
    projectMember: {
      findUnique: jest.fn(),
    },
    task: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const realtime = {
    emitTaskEvent: jest.fn(),
  };
  const audit = {
    log: jest.fn(),
  };

  let service: TasksService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TasksService(
      prisma as never,
      realtime as never,
      audit as never,
    );
  });

  it('create auto-assigns task to member author', async () => {
    prisma.project.findUnique.mockResolvedValueOnce({
      id: 'p1',
      ownerId: 'owner',
    });
    prisma.projectMember.findUnique.mockResolvedValueOnce({
      role: ProjectRole.MEMBER,
    });
    prisma.task.create.mockResolvedValueOnce({ id: 't1', assigneeId: 'u1' });

    const result = await service.create('u1', 'p1', {
      title: 'Task',
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      order: 1,
      dueDate: '2026-03-01T00:00:00.000Z',
    });

    expect(result).toEqual({ id: 't1', assigneeId: 'u1' });
    const calls = prisma.task.create.mock.calls as Array<
      [{ data: { projectId: string; assigneeId?: string } }]
    >;
    const [callArg] = calls[0];
    expect(callArg.data.projectId).toBe('p1');
    expect(callArg.data.assigneeId).toBe('u1');
  });

  it('list throws NotFound when project is missing', async () => {
    prisma.project.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.list('u1', 'missing-project', { page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assign rejects when requester is MEMBER', async () => {
    prisma.project.findUnique.mockResolvedValueOnce({
      id: 'p1',
      ownerId: 'owner',
    });
    prisma.projectMember.findUnique.mockResolvedValueOnce({
      role: ProjectRole.MEMBER,
    });

    await expect(service.assign('u1', 'p1', 't1', 'u2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('list returns paginated tasks for owner', async () => {
    prisma.project.findUnique.mockResolvedValueOnce({
      id: 'p1',
      ownerId: 'owner',
    });
    prisma.$transaction.mockResolvedValueOnce([
      1,
      [{ id: 't1', title: 'Task 1' }],
    ]);

    const result = await service.list('owner', 'p1', { page: 1, limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
  });
});
