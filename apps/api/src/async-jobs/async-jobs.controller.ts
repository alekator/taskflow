import {
  Controller,
  ForbiddenException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.type';
import { AsyncJobsService } from './async-jobs.service';

type AuthedRequest = Request & { user: RequestUser };

@Controller('async-jobs')
@UseGuards(JwtAuthGuard)
export class AsyncJobsController {
  constructor(private readonly jobs: AsyncJobsService) {}

  @Post('run-once')
  runOnce(@Req() req: AuthedRequest) {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Only ADMIN can run async jobs manually');
    }

    return this.jobs.runDueJobsOnce();
  }
}
