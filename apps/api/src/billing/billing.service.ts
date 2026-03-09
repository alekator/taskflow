import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  BillingProvider,
  Prisma,
  WorkspaceMemberRole,
  WorkspaceSubscriptionStatus,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { WorkspaceAccessService } from '../common/workspace-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingWebhookDto } from './dto/billing-webhook.dto';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceAccess: WorkspaceAccessService,
    private readonly audit: AuditService,
  ) {}

  private async ensureWorkspaceBilling(workspaceId: string) {
    return this.prisma.workspaceBilling.upsert({
      where: { workspaceId },
      update: {},
      create: {
        workspaceId,
        provider: BillingProvider.NONE,
        status: WorkspaceSubscriptionStatus.TRIALING,
        planCode: 'free',
        seats: 1,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });
  }

  private requireWorkspaceAdmin(role: WorkspaceMemberRole) {
    if (role !== WorkspaceMemberRole.ADMIN) {
      throw new ForbiddenException('Only workspace admins can manage billing');
    }
  }

  async getSubscription(requesterId: string) {
    const { workspaceId } =
      await this.workspaceAccess.getRequiredWorkspace(requesterId);
    const billing = await this.ensureWorkspaceBilling(workspaceId);
    return billing;
  }

  async createCheckoutSession(
    requesterId: string,
    dto: CreateCheckoutSessionDto,
  ) {
    const access = await this.workspaceAccess.getRequiredWorkspace(requesterId);
    this.requireWorkspaceAdmin(access.memberRole);

    const billing = await this.ensureWorkspaceBilling(access.workspaceId);
    const checkoutSessionId = `chk_${randomBytes(12).toString('hex')}`;

    await this.prisma.workspaceBillingEvent.create({
      data: {
        workspaceBillingId: billing.id,
        source: 'api',
        type: 'checkout.session.requested',
        externalEventId: checkoutSessionId,
        idempotencyKey: checkoutSessionId,
        payload: {
          planCode: dto.planCode,
          seats: dto.seats ?? billing.seats,
          successUrl: dto.successUrl ?? null,
          cancelUrl: dto.cancelUrl ?? null,
        } satisfies Prisma.InputJsonValue,
        processedAt: new Date(),
      },
    });

    await this.audit.log({
      action: 'BILLING_CHECKOUT_SESSION_CREATE',
      actorUserId: requesterId,
      entityType: 'workspace_billing',
      entityId: billing.id,
      payload: {
        workspaceId: access.workspaceId,
        planCode: dto.planCode,
        seats: dto.seats ?? billing.seats,
      },
    });

    return {
      checkoutSessionId,
      provider: billing.provider,
      status: 'PENDING',
      checkoutUrl: `https://billing.taskflow.local/checkout/${checkoutSessionId}`,
    };
  }

  async processWebhook(dto: BillingWebhookDto, secretHeader?: string) {
    const configuredSecret = process.env.BILLING_WEBHOOK_SECRET?.trim();
    if (configuredSecret && secretHeader !== configuredSecret) {
      throw new ForbiddenException('Invalid billing webhook secret');
    }

    const billing = await this.ensureWorkspaceBilling(dto.workspaceId);

    const event = await this.prisma.workspaceBillingEvent.upsert({
      where: {
        workspaceBillingId_externalEventId: {
          workspaceBillingId: billing.id,
          externalEventId: dto.eventId,
        },
      },
      update: {},
      create: {
        workspaceBillingId: billing.id,
        source: dto.provider,
        type: dto.type,
        externalEventId: dto.eventId,
        payload: (dto.payload ?? dto) as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        processedAt: true,
      },
    });

    if (event.processedAt) {
      return { ok: true, deduplicated: true };
    }

    await this.prisma.workspaceBilling.update({
      where: { id: billing.id },
      data: {
        provider: dto.provider,
        ...(dto.providerCustomerId !== undefined
          ? { providerCustomerId: dto.providerCustomerId }
          : {}),
        ...(dto.providerSubscriptionId !== undefined
          ? { providerSubscriptionId: dto.providerSubscriptionId }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.planCode !== undefined ? { planCode: dto.planCode } : {}),
        ...(dto.seats !== undefined ? { seats: dto.seats } : {}),
        ...(dto.currentPeriodStart !== undefined
          ? { currentPeriodStart: new Date(dto.currentPeriodStart) }
          : {}),
        ...(dto.currentPeriodEnd !== undefined
          ? { currentPeriodEnd: new Date(dto.currentPeriodEnd) }
          : {}),
        ...(dto.cancelAtPeriodEnd !== undefined
          ? { cancelAtPeriodEnd: dto.cancelAtPeriodEnd }
          : {}),
      },
    });

    await this.prisma.workspaceBillingEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date() },
    });

    await this.audit.log({
      action: 'BILLING_WEBHOOK_PROCESSED',
      entityType: 'workspace_billing',
      entityId: billing.id,
      payload: {
        eventId: dto.eventId,
        type: dto.type,
        workspaceId: dto.workspaceId,
      },
    });

    return { ok: true, deduplicated: false };
  }
}
