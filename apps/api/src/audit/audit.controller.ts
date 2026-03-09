import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.type';
import { AuditService } from './audit.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

type AuthedRequest = Request & { user: RequestUser };

@Controller('audit-logs')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Req() req: AuthedRequest, @Query() query: ListAuditLogsQueryDto) {
    return this.audit.list(req.user.id, query);
  }
}

@Controller('admin/audit')
@UseGuards(JwtAuthGuard)
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('verify')
  verify(@Req() req: AuthedRequest) {
    return this.audit.verifyIntegrity(req.user.id);
  }
}
