import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter<Prisma.PrismaClientKnownRequestError> {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    const mapped = mapPrismaKnownError(exception);

    res.status(mapped.statusCode).json({
      statusCode: mapped.statusCode,
      error: mapped.error,
      message: mapped.message,
      prisma: {
        code: exception.code,
        meta: exception.meta ?? undefined,
      },
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
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: 'Unique constraint failed',
      };
    case 'P2025':
      return {
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        message: 'Record not found',
      };
    case 'P2003':
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Foreign key constraint failed',
      };
    default:
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Database error',
      };
  }
}
