import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import {
  RequestContextService,
  RequestContextStore,
} from '../request-context.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly context: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const requestId = req.header('x-request-id') ?? randomUUID();
    res.setHeader('x-request-id', requestId);

    const store: RequestContextStore = {
      requestId,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    };

    this.context.run(store, () => next());
  }
}
