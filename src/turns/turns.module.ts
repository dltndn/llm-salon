import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { TurnEngineService } from './turn-engine.service';

@Module({
  imports: [PrismaModule],
  providers: [TurnEngineService],
  exports: [TurnEngineService],
})
export class TurnsModule {}
