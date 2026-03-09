import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.type';
import { BillingService } from './billing.service';
import { BillingWebhookDto } from './dto/billing-webhook.dto';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';

type AuthedRequest = Request & { user: RequestUser };

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('subscription')
  @UseGuards(JwtAuthGuard)
  getSubscription(@Req() req: AuthedRequest) {
    return this.billing.getSubscription(req.user.id);
  }

  @Post('checkout-session')
  @UseGuards(JwtAuthGuard)
  createCheckoutSession(
    @Req() req: AuthedRequest,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.billing.createCheckoutSession(req.user.id, dto);
  }

  @Post('webhooks/provider')
  @HttpCode(202)
  processProviderWebhook(
    @Body() dto: BillingWebhookDto,
    @Headers('x-billing-webhook-secret') webhookSecret: string | undefined,
  ) {
    return this.billing.processWebhook(dto, webhookSecret);
  }
}
