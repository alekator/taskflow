import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CompleteTaskAttachmentUploadDto {
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  uploadToken!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  etag?: string;
}
