import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = mapPrismaKnownError(exception);
      return res.status(mapped.statusCode).json({
        statusCode: mapped.statusCode,
        error: mapped.error,
        message: mapped.message,
        path: req.url,
        prisma: { code: exception.code, meta: exception.meta ?? undefined },
      });
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();

      const payload =
        typeof response === 'string'
          ? { message: response }
          : (response as Record<string, unknown>);

      const message =
        typeof payload.message === 'string' || Array.isArray(payload.message)
          ? payload.message
          : exception.message;

      const error =
        typeof payload.error === 'string'
          ? payload.error
          : (HttpStatus[statusCode] ?? 'Error');

      return res.status(statusCode).json({
        statusCode,
        error,
        message,
        path: req.url,
      });
    }

    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Unexpected error',
      path: req.url,
    });
  }
}

function mapPrismaKnownError(e: Prisma.PrismaClientKnownRequestError): {
  statusCode: number;
  error: string;
  message: string;
} {
  switch (e.code) {
    case 'P2002':
      return {
        statusCode: 409,
        error: 'Conflict',
        message: 'Unique constraint failed',
      };
    case 'P2025':
      return {
        statusCode: 404,
        error: 'Not Found',
        message: 'Record not found',
      };
    case 'P2003':
      return {
        statusCode: 400,
        error: 'Bad Request',
        message: 'Foreign key constraint failed',
      };
    default:
      return {
        statusCode: 400,
        error: 'Bad Request',
        message: 'Database error',
      };
  }
}
