import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { ObservabilityService } from '../../observability/observability.service';

@Injectable()
export class ObservabilityMiddleware implements NestMiddleware {
  constructor(private readonly observability: ObservabilityService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const route = req.path || req.originalUrl.split('?')[0] || '/unknown';

      this.observability.recordHttpRequest({
        method: req.method,
        route,
        statusCode: res.statusCode,
        durationMs,
      });
    });

    next();
  }
}
