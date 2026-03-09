import { ForbiddenException } from '@nestjs/common';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { AssistantService } from './assistant.service';

describe('AssistantService', () => {
  const prisma = {
    assistantMessage: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    project: {
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    task: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const config = {
    get: jest.fn(),
  };

  const workspaceAccess = {
    getRequiredWorkspace: jest.fn(),
  };

  let service: AssistantService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AssistantService(
      prisma as never,
      config as never,
      workspaceAccess as never,
    );
    workspaceAccess.getRequiredWorkspace.mockResolvedValue({
      workspaceId: 'ws-main',
      memberRole: 'MEMBER',
    });
  });

  it('builds project summary with risk counters and assignee load', async () => {
    prisma.project.findFirst.mockResolvedValueOnce({
      id: 'p1',
      name: 'Roadmap',
      description: null,
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    });
    prisma.task.count
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    prisma.task.groupBy
      .mockResolvedValueOnce([
        { status: TaskStatus.TODO, _count: { _all: 2 } },
        { status: TaskStatus.IN_PROGRESS, _count: { _all: 3 } },
        { status: TaskStatus.TESTING, _count: { _all: 0 } },
        { status: TaskStatus.DONE, _count: { _all: 3 } },
      ])
      .mockResolvedValueOnce([
        { assigneeId: 'u1', _count: { _all: 3 } },
        { assigneeId: 'u2', _count: { _all: 2 } },
      ]);
    prisma.user.findMany.mockResolvedValueOnce([
      { id: 'u1', email: 'u1@test.com', name: 'U1' },
      { id: 'u2', email: 'u2@test.com', name: 'U2' },
    ]);
    prisma.task.findMany.mockResolvedValueOnce([
      {
        id: 't1',
        title: 'Task 1',
        status: TaskStatus.TODO,
        priority: TaskPriority.HIGH,
        dueDate: null,
        updatedAt: new Date('2026-03-02T00:00:00.000Z'),
        assignee: { id: 'u1', name: 'U1', email: 'u1@test.com' },
      },
    ]);

    const result = await service.getProjectSummary('u1', 'USER', 'p1');

    expect(result.project.id).toBe('p1');
    expect(result.stats).toEqual({
      totalTasks: 8,
      openTasks: 5,
      doneTasks: 3,
      overdueOpenTasks: 2,
      highPriorityOpenTasks: 2,
      staleOpenTasks: 1,
    });
    expect(result.statusBreakdown).toEqual({
      TODO: 2,
      IN_PROGRESS: 3,
      TESTING: 0,
      DONE: 3,
    });
    expect(result.assigneeLoad[0]).toEqual({
      userId: 'u1',
      name: 'U1',
      email: 'u1@test.com',
      openTasks: 3,
    });
    expect(result.recentTasks).toHaveLength(1);
    expect(result.summary).toContain('5 open of 8 tasks');

    expect(prisma.project.findFirst).toHaveBeenCalled();
    const [findFirstArg] = prisma.project.findFirst.mock.calls[0] as [
      {
        where: {
          workspaceId: string;
          id: string;
        };
      },
    ];
    expect(findFirstArg.where.workspaceId).toBe('ws-main');
    expect(findFirstArg.where.id).toBe('p1');
  });

  it('throws when project is not accessible', async () => {
    prisma.project.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.getProjectSummary('u2', 'USER', 'missing'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
