import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class SubmitMessageDto {
  @IsUUID()
  participantId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(32768)
  content!: string;
}
