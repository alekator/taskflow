import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: jest.Mocked<Pick<AppService, 'getHello' | 'health'>>;

  beforeEach(() => {
    appService = {
      getHello: jest.fn().mockReturnValue('OK'),
      health: jest.fn().mockResolvedValue({ status: 'ok' }),
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
});
