import { ConfigService } from '@nestjs/config';
import { InviteEmailDeliveryService } from './invite-email-delivery.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

function getCreateTransportMock(): jest.Mock {
  const mockModule: unknown = jest.requireMock('nodemailer');
  if (
    !mockModule ||
    typeof mockModule !== 'object' ||
    !('createTransport' in mockModule)
  ) {
    throw new Error('Invalid nodemailer mock module');
  }

  return (mockModule as { createTransport: jest.Mock }).createTransport;
}

describe('InviteEmailDeliveryService', () => {
  const config = {
    get: jest.fn(),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns simulated delivery when provider is not smtp', async () => {
    (config.get as jest.Mock).mockImplementation(
      (key: string, fallback?: unknown) => {
        if (key === 'INVITE_EMAIL_PROVIDER') return 'simulated';
        return fallback;
      },
    );

    const service = new InviteEmailDeliveryService(config);
    const result = await service.dispatch({
      email: 'test@example.com',
      inviteLink: 'http://localhost/invite',
    });

    expect(result).toEqual({ delivery: 'simulated' });
    expect(getCreateTransportMock()).not.toHaveBeenCalled();
  });

  it('sends smtp email when provider is smtp', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'msg-1' });
    getCreateTransportMock().mockReturnValue({ sendMail } as never);
    (config.get as jest.Mock).mockImplementation(
      (key: string, fallback?: unknown) => {
        const map: Record<string, unknown> = {
          INVITE_EMAIL_PROVIDER: 'smtp',
          INVITE_SMTP_HOST: 'smtp.example.com',
          INVITE_SMTP_PORT: '587',
          INVITE_SMTP_SECURE: 'false',
          INVITE_SMTP_USER: 'user',
          INVITE_SMTP_PASS: 'pass',
          INVITE_EMAIL_FROM: 'TaskFlow <no-reply@example.com>',
        };
        return map[key] ?? fallback;
      },
    );

    const service = new InviteEmailDeliveryService(config);
    const result = await service.dispatch({
      email: 'test@example.com',
      inviteLink: 'https://taskflow.example.com/auth/register?invite=abc',
    });

    expect(result).toEqual({ delivery: 'smtp', messageId: 'msg-1' });
    expect(getCreateTransportMock()).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: {
        user: 'user',
        pass: 'pass',
      },
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
