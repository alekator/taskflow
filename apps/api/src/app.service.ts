import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

type DependencyStatus = 'CONNECTED' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
type ServiceStatus = DependencyStatus | 'ENABLED';
type DatabaseHealth = {
  status: DependencyStatus;
  latencyMs: number | null;
};

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

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
    };
  }
}
