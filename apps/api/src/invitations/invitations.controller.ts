import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.type';
import { CreateWorkspaceInvitationDto } from './dto/create-workspace-invitation.dto';
import { ListWorkspaceInvitationsQueryDto } from './dto/list-workspace-invitations-query.dto';
import { InvitationsService } from './invitations.service';

type AuthedRequest = Request & { user: RequestUser };

@Controller('workspace-invitations')
@UseGuards(JwtAuthGuard)
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateWorkspaceInvitationDto) {
    return this.invitations.create(req.user.id, dto);
  }

  @Get()
  list(
    @Req() req: AuthedRequest,
    @Query() query: ListWorkspaceInvitationsQueryDto,
  ) {
    return this.invitations.list(req.user.id, query);
  }

  @Post(':id/revoke')
  revoke(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.invitations.revoke(req.user.id, id);
  }
}
