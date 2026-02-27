import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.type';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UsersService } from './users.service';

type AuthedRequest = Request & { user: RequestUser };

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  list(@Req() req: AuthedRequest, @Query() query: ListUsersQueryDto) {
    return this.users.list(req.user.id, query);
  }

  @Get('me')
  me(@Req() req: AuthedRequest) {
    return this.users.getMe(req.user.id);
  }
}
