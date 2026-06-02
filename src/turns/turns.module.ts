import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { TurnEngineService } from './turn-engine.service';
import { TurnsController } from './turns.controller';
import { TurnsService } from './turns.service';

@Module({
  imports: [PrismaModule],
  controllers: [TurnsController],
  providers: [TurnEngineService, TurnsService],
  exports: [TurnEngineService, TurnsService],
})
export class TurnsModule {}
