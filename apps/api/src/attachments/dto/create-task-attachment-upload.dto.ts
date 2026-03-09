import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateTaskAttachmentUploadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  fileName!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  sizeBytes!: number;
}
