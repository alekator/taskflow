import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';

type InviteEmailDispatchInput = {
  email: string;
  inviteLink: string;
};

type InviteEmailDispatchResult = {
  delivery: 'simulated' | 'smtp';
  messageId?: string;
};

type MailTransport = {
  sendMail(payload: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<{ messageId?: string }>;
};

type MailerModule = {
  createTransport(payload: {
    host: string;
    port: number;
    secure: boolean;
    auth?: {
      user: string;
      pass: string;
    };
  }): MailTransport;
};

@Injectable()
export class InviteEmailDeliveryService {
  private transporter: MailTransport | null = null;

  constructor(private readonly config: ConfigService) {}

  private getProvider(): 'simulated' | 'smtp' {
    const raw = (
      this.config.get<string>('INVITE_EMAIL_PROVIDER', 'simulated') ??
      'simulated'
    )
      .trim()
      .toLowerCase();
    return raw === 'smtp' ? 'smtp' : 'simulated';
  }

  private parseBool(value: string | undefined, fallback: boolean) {
    if (!value) return fallback;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return fallback;
  }

  private getTransporter(): MailTransport {
    if (this.transporter) {
      return this.transporter;
    }

    const host = this.config.get<string>('INVITE_SMTP_HOST');
    const portRaw = this.config.get<string>('INVITE_SMTP_PORT', '587');
    const port = Number.parseInt(portRaw, 10);
    const secure = this.parseBool(
      this.config.get<string>('INVITE_SMTP_SECURE', 'false'),
      false,
    );
    const user = this.config.get<string>('INVITE_SMTP_USER');
    const pass = this.config.get<string>('INVITE_SMTP_PASS');

    if (!host?.trim()) {
      throw new Error('INVITE_SMTP_HOST is required for SMTP email delivery');
    }

    if (!Number.isInteger(port) || port <= 0) {
      throw new Error('INVITE_SMTP_PORT must be a positive integer');
    }

    this.transporter = (createTransport as MailerModule['createTransport'])({
      host: host.trim(),
      port,
      secure,
      auth:
        user && pass
          ? {
              user,
              pass,
            }
          : undefined,
    });

    return this.transporter;
  }

  async dispatch(
    input: InviteEmailDispatchInput,
  ): Promise<InviteEmailDispatchResult> {
    if (this.getProvider() !== 'smtp') {
      return { delivery: 'simulated' };
    }

    const from =
      this.config.get<string>('INVITE_EMAIL_FROM') ??
      'TaskFlow <no-reply@taskflow.local>';
    const subject = 'You were invited to TaskFlow workspace';
    const text = [
      'You received an invitation to join a TaskFlow workspace.',
      '',
      `Open this link to continue registration: ${input.inviteLink}`,
      '',
      'If you were not expecting this invitation, you can ignore this email.',
    ].join('\n');

    const transporter = this.getTransporter();
    const info = await transporter.sendMail({
      from,
      to: input.email,
      subject,
      text,
      html: `<p>You received an invitation to join a TaskFlow workspace.</p><p><a href="${input.inviteLink}">Accept invitation</a></p><p>If you were not expecting this invitation, you can ignore this email.</p>`,
    });

    return {
      delivery: 'smtp',
      messageId:
        typeof info.messageId === 'string' ? info.messageId : undefined,
    };
  }
}
