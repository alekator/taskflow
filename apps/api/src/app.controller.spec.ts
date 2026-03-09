import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: jest.Mocked<
    Pick<AppService, 'getHello' | 'health' | 'live' | 'ready' | 'metrics'>
  >;

  beforeEach(() => {
    appService = {
      getHello: jest.fn().mockReturnValue('OK'),
      health: jest.fn().mockResolvedValue({ status: 'ok' }),
      live: jest.fn().mockReturnValue({ status: 'ok' }),
      ready: jest.fn().mockResolvedValue({ status: 'ready' }),
      metrics: jest.fn().mockReturnValue('taskflow_http_requests_total 0'),
    };
    appController = new AppController(appService as AppService);
  });

  it('getHello returns AppService response', () => {
    expect(appController.getHello()).toBe('OK');
    expect(appService.getHello).toHaveBeenCalledTimes(1);
  });

  it('health delegates to AppService', async () => {
    await expect(appController.health()).resolves.toEqual({ status: 'ok' });
    expect(appService.health).toHaveBeenCalledTimes(1);
  });

  it('live delegates to AppService', () => {
    expect(appController.live()).toEqual({ status: 'ok' });
    expect(appService.live).toHaveBeenCalledTimes(1);
  });

  it('ready delegates to AppService', async () => {
    await expect(appController.ready()).resolves.toEqual({ status: 'ready' });
    expect(appService.ready).toHaveBeenCalledTimes(1);
  });

  it('metrics delegates to AppService', () => {
    expect(appController.metrics()).toBe('taskflow_http_requests_total 0');
    expect(appService.metrics).toHaveBeenCalledTimes(1);
  });
});
