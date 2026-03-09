import { BillingProvider, WorkspaceSubscriptionStatus } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class BillingWebhookDto {
  @IsEnum(BillingProvider)
  provider!: BillingProvider;

  @IsString()
  @MinLength(3)
  eventId!: string;

  @IsString()
  @MinLength(3)
  type!: string;

  @IsString()
  @MinLength(3)
  workspaceId!: string;

  @IsOptional()
  @IsString()
  providerCustomerId?: string;

  @IsOptional()
  @IsString()
  providerSubscriptionId?: string;

  @IsOptional()
  @IsEnum(WorkspaceSubscriptionStatus)
  status?: WorkspaceSubscriptionStatus;

  @IsOptional()
  @IsString()
  planCode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  seats?: number;

  @IsOptional()
  @IsDateString()
  currentPeriodStart?: string;

  @IsOptional()
  @IsDateString()
  currentPeriodEnd?: string;

  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;

  @IsOptional()
  payload?: Record<string, unknown>;
}
