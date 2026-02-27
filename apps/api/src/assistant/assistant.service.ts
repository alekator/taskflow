import { Injectable } from '@nestjs/common';
import {
  AssistantMessageMode,
  AssistantMessageRole,
  Prisma,
  TaskStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { toPaginatedResult } from '../common/pagination';
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

@Injectable()
export class AssistantService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
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
    userId: string,
    userRole: string,
    userMessage: string,
  ) {
    const scopeWhere = this.buildWorkspaceAccessWhere(userId, userRole);

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

    const visibleProjects = await this.countVisibleProjects(userId, userRole);

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

  private async countVisibleProjects(userId: string, userRole: string) {
    if (userRole === 'ADMIN') {
      return this.prisma.project.count();
    }

    return this.prisma.project.count({
      where: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
    });
  }

  private buildWorkspaceAccessWhere(
    userId: string,
    userRole: string,
  ): Prisma.TaskWhereInput {
    if (userRole === 'ADMIN') {
      return {};
    }

    return {
      project: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
    };
  }

  private async generateLlmReply(input: {
    apiKey: string;
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
                content: `Current user: ${input.userEmail} (${input.userRole}, id ${input.userId}).`,
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
