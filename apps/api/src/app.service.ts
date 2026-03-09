import { Injectable } from '@nestjs/common';
import { AsyncJobStatus } from '@prisma/client';
import { ObservabilityService } from './observability/observability.service';
import { PrismaService } from './prisma/prisma.service';

type DependencyStatus = 'CONNECTED' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
type ServiceStatus = DependencyStatus | 'ENABLED';
type DatabaseHealth = {
  status: DependencyStatus;
  latencyMs: number | null;
};

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly observability: ObservabilityService,
  ) {}

  getHello(): string {
    return 'OK';
  }

  private async getDatabaseStatus(): Promise<DatabaseHealth> {
    if (!process.env.DATABASE_URL) {
      return { status: 'NOT_CONFIGURED', latencyMs: null };
    }

    try {
      const startedAt = process.hrtime.bigint();
      await this.prisma.$queryRawUnsafe('SELECT 1');
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      return {
        status: 'CONNECTED',
        latencyMs: Math.round(durationMs * 10) / 10,
      };
    } catch {
      return { status: 'UNAVAILABLE', latencyMs: null };
    }
  }

  async health() {
    const memory = process.memoryUsage();
    const database = await this.getDatabaseStatus();
    const http = this.observability.getHttpSnapshot();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      runtime: {
        pid: process.pid,
        nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV ?? 'development',
      },
      memory: {
        rssMb: Math.round(memory.rss / 1024 / 1024),
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
        externalMb: Math.round(memory.external / 1024 / 1024),
        heapUsagePercent:
          memory.heapTotal === 0
            ? 0
            : Math.round((memory.heapUsed / memory.heapTotal) * 100),
      },
      services: {
        database: database.status,
        databaseLatencyMs: database.latencyMs,
        realtime: 'ENABLED' as ServiceStatus,
      },
      http,
    };
  }

  live() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  async ready() {
    const database = await this.getDatabaseStatus();
    const ready = database.status === 'CONNECTED';

    return {
      status: ready ? 'ready' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: database.status,
        databaseLatencyMs: database.latencyMs,
      },
    };
  }

  private async getFailedJobsRecentCount(): Promise<number> {
    if (!process.env.DATABASE_URL) {
      return 0;
    }

    try {
      const since = new Date(Date.now() - 15 * 60 * 1000);
      return await this.prisma.asyncJob.count({
        where: {
          status: AsyncJobStatus.FAILED,
          updatedAt: { gte: since },
        },
      });
    } catch {
      return 0;
    }
  }

  async metrics() {
    const base = this.observability.renderPrometheusMetrics();
    const database = await this.getDatabaseStatus();
    const failedJobsRecent = await this.getFailedJobsRecentCount();

    const dbConnected = database.status === 'CONNECTED' ? 1 : 0;
    const dbLatencyMs = database.latencyMs ?? 0;

    return [
      base,
      '',
      '# HELP taskflow_database_connected Database connectivity status (1=connected, 0=degraded)',
      '# TYPE taskflow_database_connected gauge',
      `taskflow_database_connected ${dbConnected}`,
      '',
      '# HELP taskflow_database_latency_ms Database healthcheck latency in milliseconds',
      '# TYPE taskflow_database_latency_ms gauge',
      `taskflow_database_latency_ms ${dbLatencyMs}`,
      '',
      '# HELP taskflow_async_jobs_failed_recent Number of failed async jobs updated in last 15 minutes',
      '# TYPE taskflow_async_jobs_failed_recent gauge',
      `taskflow_async_jobs_failed_recent ${failedJobsRecent}`,
    ].join('\n');
  }
}
