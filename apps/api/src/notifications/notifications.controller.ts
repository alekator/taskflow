import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.type';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationsService } from './notifications.service';

type AuthedRequest = Request & { user: RequestUser };

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Req() req: AuthedRequest, @Query() query: ListNotificationsQueryDto) {
    return this.notifications.list(req.user.id, req.user.role, query);
  }

  @Get('unread-count')
  unreadCount(@Req() req: AuthedRequest) {
    return this.notifications.unreadCount(req.user.id, req.user.role);
  }

  @Patch('read-all')
  markAllRead(@Req() req: AuthedRequest) {
    return this.notifications.markAllRead(req.user.id, req.user.role);
  }

  @Patch(':id/read')
  markRead(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.notifications.markRead(req.user.id, req.user.role, id);
  }
}
