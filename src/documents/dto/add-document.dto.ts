import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class AddDocumentDto {
  @IsOptional()
  @IsUUID()
  topicId?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  fileName!: string;

  @IsString()
  @MinLength(1)
  content!: string;
}
