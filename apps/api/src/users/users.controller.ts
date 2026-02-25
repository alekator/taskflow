import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.type';
import { UsersService } from './users.service';

type AuthedRequest = Request & { user: RequestUser };

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  me(@Req() req: AuthedRequest) {
    return this.users.getMe(req.user.id);
  }
}
