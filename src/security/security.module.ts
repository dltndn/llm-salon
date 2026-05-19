import { Module } from '@nestjs/common';

import { ProviderKeyService } from './provider-key.service';

@Module({
  providers: [ProviderKeyService],
  exports: [ProviderKeyService],
})
export class SecurityModule {}
