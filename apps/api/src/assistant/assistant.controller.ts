import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.type';
import { ListAssistantMessagesQueryDto } from './dto/list-assistant-messages-query.dto';
import { ProjectSummaryQueryDto } from './dto/project-summary-query.dto';
import { SendAssistantMessageDto } from './dto/send-assistant-message.dto';
import { AssistantService } from './assistant.service';

type AuthedRequest = Request & { user: RequestUser };

@Controller('assistant')
@UseGuards(JwtAuthGuard)
export class AssistantController {
  constructor(private assistant: AssistantService) {}

  @Get('history')
  listHistory(
    @Req() req: AuthedRequest,
    @Query() query: ListAssistantMessagesQueryDto,
  ) {
    return this.assistant.listHistory(req.user.id, query);
  }

  @Post('messages')
  sendMessage(@Req() req: AuthedRequest, @Body() dto: SendAssistantMessageDto) {
    return this.assistant.sendMessage(
      req.user.id,
      req.user.email,
      req.user.role,
      dto.message,
    );
  }

  @Get('project-summary')
  getProjectSummary(
    @Req() req: AuthedRequest,
    @Query() query: ProjectSummaryQueryDto,
  ) {
    return this.assistant.getProjectSummary(
      req.user.id,
      req.user.role,
      query.projectId,
    );
  }
}
