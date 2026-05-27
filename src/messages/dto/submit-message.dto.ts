import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  DEBATE_SIGNAL_VALUES,
  DebateSignalValue,
} from '../../common/debate-signal';

export class SubmitMessageDto {
  @IsUUID()
  participantId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(32768)
  content!: string;

  @IsOptional()
  @IsIn(DEBATE_SIGNAL_VALUES)
  debateSignal?: DebateSignalValue;
}
