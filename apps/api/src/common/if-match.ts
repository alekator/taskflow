import {
  BadRequestException,
  HttpException,
  HttpStatus,
  PreconditionFailedException,
} from '@nestjs/common';

export function requireIfMatchVersion(ifMatchHeader?: string): number {
  if (!ifMatchHeader) {
    throw new HttpException(
      'If-Match header is required',
      HttpStatus.PRECONDITION_REQUIRED,
    );
  }

  const normalized = ifMatchHeader.trim().replace(/^W\//, '');
  const value =
    normalized.startsWith('"') && normalized.endsWith('"')
      ? normalized.slice(1, -1)
      : normalized;

  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) {
    throw new BadRequestException('Invalid If-Match header');
  }

  return version;
}

export function assertVersionMatch(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new PreconditionFailedException('Version mismatch');
  }
}
