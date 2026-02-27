import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;
  const prisma = {
    $queryRawUnsafe: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AppService(prisma as never);
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
  });
});
