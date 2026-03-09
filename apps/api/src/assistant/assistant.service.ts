import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AssistantMessageMode,
  AssistantMessageRole,
  Prisma,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { toPaginatedResult } from '../common/pagination';
import { WorkspaceAccessService } from '../common/workspace-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListAssistantMessagesQueryDto } from './dto/list-assistant-messages-query.dto';

type SendResult = {
  userMessage: {
    id: string;
    role: AssistantMessageRole;
    mode: AssistantMessageMode;
    message: string;
    createdAt: Date;
  };
  assistantMessage: {
    id: string;
    role: AssistantMessageRole;
    mode: AssistantMessageMode;
    message: string;
    createdAt: Date;
  };
  mode: AssistantMessageMode;
  llmEnabled: boolean;
  remainingDailyLimit: number | null;
};

type ProjectSummaryResult = {
  project: {
    id: string;
    name: string;
    description: string | null;
    updatedAt: Date;
  };
  stats: {
    totalTasks: number;
    openTasks: number;
    doneTasks: number;
    overdueOpenTasks: number;
    highPriorityOpenTasks: number;
    staleOpenTasks: number;
  };
  statusBreakdown: {
    TODO: number;
    IN_PROGRESS: number;
    TESTING: number;
    DONE: number;
  };
  assigneeLoad: Array<{
    userId: string | null;
    name: string | null;
    email: string | null;
    openTasks: number;
  }>;
  recentTasks: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate: Date | null;
    updatedAt: Date;
    assignee: {
      id: string;
      name: string | null;
      email: string;
    } | null;
  }>;
  summary: string;
};

@Injectable()
export class AssistantService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private workspaceAccess: WorkspaceAccessService,
  ) {}

  async listHistory(userId: string, query: ListAssistantMessagesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const sortOrder = query.sortOrder ?? 'desc';

    const [total, items] = await this.prisma.$transaction([
      this.prisma.assistantMessage.count({ where: { userId } }),
      this.prisma.assistantMessage.findMany({
        where: { userId },
        orderBy: { createdAt: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          role: true,
          mode: true,
          message: true,
          metadata: true,
          createdAt: true,
        },
      }),
    ]);

    return toPaginatedResult(items, page, limit, total);
  }

  async sendMessage(
    userId: string,
    userEmail: string,
    userRole: string,
    rawMessage: string,
  ): Promise<SendResult> {
    const { workspaceId } =
      await this.workspaceAccess.getRequiredWorkspace(userId);
    const message = rawMessage.trim();

    const userMessage = await this.prisma.assistantMessage.create({
      data: {
        userId,
        role: AssistantMessageRole.USER,
        mode: AssistantMessageMode.BASIC,
        message,
      },
      select: {
        id: true,
        role: true,
        mode: true,
        message: true,
        createdAt: true,
      },
    });

    const openAiApiKey = this.config.get<string>('ASSISTANT_OPENAI_API_KEY');
    const llmEnabled = Boolean(openAiApiKey?.trim());
    const dailyLimit = this.config.get<number>('ASSISTANT_DAILY_LIMIT', 25);
    const maxOutputTokens = this.config.get<number>(
      'ASSISTANT_MAX_OUTPUT_TOKENS',
      350,
    );
    const temperature = this.config.get<number>('ASSISTANT_TEMPERATURE', 0.2);

    let assistantMode: AssistantMessageMode = AssistantMessageMode.BASIC;
    let assistantMessageText = await this.buildBasicAssistantReply(
      workspaceId,
      userId,
      userRole,
      message,
    );
    let remainingDailyLimit: number | null = null;
    let llmError: string | undefined;

    if (llmEnabled) {
      const usedToday = await this.countTodayLlmReplies(userId);
      const remainingBefore = Math.max(0, dailyLimit - usedToday);
      remainingDailyLimit = remainingBefore;

      if (remainingBefore > 0) {
        try {
          const llmText = await this.generateLlmReply({
            apiKey: openAiApiKey as string,
            workspaceId,
            userId,
            userEmail,
            userRole,
            userMessage: message,
            maxOutputTokens,
            temperature,
          });

          if (llmText) {
            assistantMode = AssistantMessageMode.LLM;
            assistantMessageText = llmText;
            remainingDailyLimit = Math.max(0, remainingBefore - 1);
          }
        } catch (error) {
          llmError =
            error instanceof Error ? error.message : 'LLM request failed';
        }
      }
    }

    const assistantMessage = await this.prisma.assistantMessage.create({
      data: {
        userId,
        role: AssistantMessageRole.ASSISTANT,
        mode: assistantMode,
        message: assistantMessageText,
        metadata:
          assistantMode === AssistantMessageMode.BASIC
            ? {
                llmEnabled,
                llmError,
              }
            : {
                llmEnabled: true,
              },
      },
      select: {
        id: true,
        role: true,
        mode: true,
        message: true,
        createdAt: true,
      },
    });

    return {
      userMessage,
      assistantMessage,
      mode: assistantMode,
      llmEnabled,
      remainingDailyLimit,
    };
  }

  async getProjectSummary(
    userId: string,
    userRole: string,
    projectId: string,
  ): Promise<ProjectSummaryResult> {
    const { workspaceId } =
      await this.workspaceAccess.getRequiredWorkspace(userId);
    const project = await this.prisma.project.findFirst({
      where: this.buildProjectAccessWhere(workspaceId, userId, userRole, {
        id: projectId,
      }),
      select: {
        id: true,
        name: true,
        description: true,
        updatedAt: true,
      },
    });

    if (!project) {
      throw new ForbiddenException('Project is not accessible');
    }

    const now = new Date();
    const staleThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const openStatuses = [
      TaskStatus.TODO,
      TaskStatus.IN_PROGRESS,
      TaskStatus.TESTING,
    ];

    const [
      totalTasks,
      doneTasks,
      overdueOpenTasks,
      highPriorityOpenTasks,
      staleOpenTasks,
      statusGroups,
      assigneeGroups,
      recentTasks,
    ] = await Promise.all([
      this.prisma.task.count({ where: { projectId } }),
      this.prisma.task.count({ where: { projectId, status: TaskStatus.DONE } }),
      this.prisma.task.count({
        where: {
          projectId,
          dueDate: { lt: now },
          status: { in: openStatuses },
        },
      }),
      this.prisma.task.count({
        where: {
          projectId,
          status: { in: openStatuses },
          priority: { in: [TaskPriority.HIGH, TaskPriority.URGENT] },
        },
      }),
      this.prisma.task.count({
        where: {
          projectId,
          status: { in: openStatuses },
          updatedAt: { lt: staleThreshold },
        },
      }),
      this.prisma.task.groupBy({
        by: ['status'],
        where: { projectId },
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['assigneeId'],
        where: {
          projectId,
          status: { in: openStatuses },
        },
        _count: { _all: true },
      }),
      this.prisma.task.findMany({
        where: { projectId },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          updatedAt: true,
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
    ]);

    const statusBreakdown: ProjectSummaryResult['statusBreakdown'] = {
      TODO: 0,
      IN_PROGRESS: 0,
      TESTING: 0,
      DONE: 0,
    };

    for (const group of statusGroups) {
      statusBreakdown[group.status] = group._count._all;
    }

    const assigneeIds = assigneeGroups
      .map((group) => group.assigneeId)
      .filter((id): id is string => Boolean(id));

    const assignees = assigneeIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: assigneeIds } },
          select: { id: true, email: true, name: true },
        })
      : [];

    const assigneeMap = new Map(assignees.map((user) => [user.id, user]));
    const assigneeLoad = assigneeGroups
      .map((group) => {
        const user = group.assigneeId
          ? (assigneeMap.get(group.assigneeId) ?? null)
          : null;
        return {
          userId: group.assigneeId,
          name: user?.name ?? null,
          email: user?.email ?? null,
          openTasks: group._count._all,
        };
      })
      .sort((a, b) => b.openTasks - a.openTasks);

    const openTasks = totalTasks - doneTasks;
    const summary = [
      `Project "${project.name}" summary: ${openTasks} open of ${totalTasks} tasks.`,
      `Risks: overdue ${overdueOpenTasks}, high-priority open ${highPriorityOpenTasks}, stale open ${staleOpenTasks}.`,
      `Status: TODO ${statusBreakdown.TODO}, IN_PROGRESS ${statusBreakdown.IN_PROGRESS}, TESTING ${statusBreakdown.TESTING}, DONE ${statusBreakdown.DONE}.`,
    ].join(' ');

    return {
      project,
      stats: {
        totalTasks,
        openTasks,
        doneTasks,
        overdueOpenTasks,
        highPriorityOpenTasks,
        staleOpenTasks,
      },
      statusBreakdown,
      assigneeLoad,
      recentTasks,
      summary,
    };
  }

  private countTodayLlmReplies(userId: string) {
    const now = new Date();
    const dayStartUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const nextDayUtc = new Date(dayStartUtc);
    nextDayUtc.setUTCDate(nextDayUtc.getUTCDate() + 1);

    return this.prisma.assistantMessage.count({
      where: {
        userId,
        role: AssistantMessageRole.ASSISTANT,
        mode: AssistantMessageMode.LLM,
        createdAt: {
          gte: dayStartUtc,
          lt: nextDayUtc,
        },
      },
    });
  }

  private async buildBasicAssistantReply(
    workspaceId: string,
    userId: string,
    userRole: string,
    userMessage: string,
  ) {
    const scopeWhere = this.buildWorkspaceTaskAccessWhere(
      workspaceId,
      userId,
      userRole,
    );

    const [totalTasks, todoTasks, inProgressTasks, testingTasks, doneTasks] =
      await this.prisma.$transaction([
        this.prisma.task.count({ where: scopeWhere }),
        this.prisma.task.count({
          where: { ...scopeWhere, status: TaskStatus.TODO },
        }),
        this.prisma.task.count({
          where: { ...scopeWhere, status: TaskStatus.IN_PROGRESS },
        }),
        this.prisma.task.count({
          where: { ...scopeWhere, status: TaskStatus.TESTING },
        }),
        this.prisma.task.count({
          where: { ...scopeWhere, status: TaskStatus.DONE },
        }),
      ]);

    const visibleProjects = await this.countVisibleProjects(
      workspaceId,
      userId,
      userRole,
    );

    const latestTask = await this.prisma.task.findFirst({
      where: scopeWhere,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        project: { select: { name: true } },
      },
    });

    const openTasks = todoTasks + inProgressTasks + testingTasks;
    const quotedQuestion =
      userMessage.length > 150
        ? `${userMessage.slice(0, 150)}...`
        : userMessage;

    const latestTaskLine = latestTask
      ? `Latest updated task: "${latestTask.title}" in project "${latestTask.project.name}" (${latestTask.status.toLowerCase()}) at ${latestTask.updatedAt.toISOString()}.`
      : 'Latest updated task: no visible tasks yet.';

    return [
      `Basic assistant mode (free): I cannot call external LLM because OpenAI key is not configured or unavailable right now.`,
      `You asked: "${quotedQuestion}"`,
      `Workspace snapshot: projects ${visibleProjects}, tasks total ${totalTasks}, open ${openTasks}, done ${doneTasks}.`,
      `Status breakdown: TODO ${todoTasks}, IN_PROGRESS ${inProgressTasks}, TESTING ${testingTasks}, DONE ${doneTasks}.`,
      latestTaskLine,
      `Tip: add ASSISTANT_OPENAI_API_KEY in env to enable full assistant responses with configurable limits.`,
    ].join('\n');
  }

  private async countVisibleProjects(
    workspaceId: string,
    userId: string,
    userRole: string,
  ) {
    return this.prisma.project.count({
      where: this.buildProjectAccessWhere(workspaceId, userId, userRole),
    });
  }

  private buildWorkspaceTaskAccessWhere(
    workspaceId: string,
    userId: string,
    userRole: string,
  ): Prisma.TaskWhereInput {
    const projectScope = this.buildProjectAccessWhere(
      workspaceId,
      userId,
      userRole,
    );

    return {
      project: projectScope,
    };
  }

  private buildProjectAccessWhere(
    workspaceId: string,
    userId: string,
    userRole: string,
    extra?: Prisma.ProjectWhereInput,
  ): Prisma.ProjectWhereInput {
    if (userRole === 'ADMIN') {
      return {
        workspaceId,
        ...(extra ?? {}),
      };
    }

    return {
      workspaceId,
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      ...(extra ?? {}),
    };
  }

  private async generateLlmReply(input: {
    apiKey: string;
    workspaceId: string;
    userId: string;
    userEmail: string;
    userRole: string;
    userMessage: string;
    maxOutputTokens: number;
    temperature: number;
  }) {
    const model = this.config.get<string>(
      'ASSISTANT_OPENAI_MODEL',
      'gpt-4o-mini',
    );
    const baseUrl = this.config.get<string>(
      'ASSISTANT_OPENAI_BASE_URL',
      'https://api.openai.com/v1',
    );
    const timeoutMs = this.config.get<number>(
      'ASSISTANT_LLM_TIMEOUT_MS',
      15_000,
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(
        `${baseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${input.apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: input.temperature,
            max_tokens: input.maxOutputTokens,
            messages: [
              {
                role: 'system',
                content:
                  'You are TaskFlow assistant. Be concise, practical, and focus on task/workspace guidance.',
              },
              {
                role: 'system',
                content: `Current user: ${input.userEmail} (${input.userRole}, id ${input.userId}) in workspace ${input.workspaceId}.`,
              },
              {
                role: 'user',
                content: input.userMessage,
              },
            ],
          }),
          signal: controller.signal,
        },
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenAI ${res.status}: ${text.slice(0, 240)}`);
      }

      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = body.choices?.[0]?.message?.content?.trim();
      return content && content.length > 0 ? content : null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
