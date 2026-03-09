import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;
  const prisma = {
    $queryRawUnsafe: jest.fn(),
    asyncJob: {
      count: jest.fn(),
    },
  };
  const observability = {
    getHttpSnapshot: jest.fn(),
    renderPrometheusMetrics: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    observability.getHttpSnapshot.mockReturnValue({
      total: 0,
      errors: 0,
      byStatusClass: {},
      latency: { avgMs: 0, p95Ms: 0, maxMs: 0 },
    });
    observability.renderPrometheusMetrics.mockReturnValue(
      'taskflow_http_requests_total 0',
    );
    prisma.asyncJob.count.mockResolvedValue(0);
    service = new AppService(prisma as never, observability as never);
  });

  it('getHello returns OK', () => {
    expect(service.getHello()).toBe('OK');
  });

  it('health returns stable shape', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

    const result = await service.health();

    expect(result.status).toBe('ok');
    expect(typeof result.timestamp).toBe('string');
    expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
    expect(typeof result.runtime.pid).toBe('number');
    expect(typeof result.runtime.nodeVersion).toBe('string');
    expect(typeof result.runtime.uptimeSeconds).toBe('number');
    expect(typeof result.runtime.environment).toBe('string');
    expect(typeof result.memory.rssMb).toBe('number');
    expect(typeof result.memory.heapUsedMb).toBe('number');
    expect(typeof result.memory.heapTotalMb).toBe('number');
    expect(typeof result.memory.externalMb).toBe('number');
    expect(typeof result.memory.heapUsagePercent).toBe('number');
    expect(result.services.database).toBe('CONNECTED');
    expect(typeof result.services.databaseLatencyMs).toBe('number');
    expect(result.services.realtime).toBe('ENABLED');
    expect(typeof result.http.total).toBe('number');
  });

  it('live returns liveness payload', () => {
    const result = service.live();

    expect(result.status).toBe('ok');
    expect(typeof result.timestamp).toBe('string');
    expect(typeof result.uptimeSeconds).toBe('number');
  });

  it('ready returns readiness payload', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

    const result = await service.ready();

    expect(result.status).toBe('ready');
    expect(result.services.database).toBe('CONNECTED');
  });

  it('metrics returns prometheus text from observability service', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    prisma.asyncJob.count.mockResolvedValue(2);

    const text = await service.metrics();
    expect(text).toContain('taskflow_http_requests_total');
    expect(text).toContain('taskflow_database_connected 1');
    expect(text).toContain('taskflow_async_jobs_failed_recent 2');
  });
});
