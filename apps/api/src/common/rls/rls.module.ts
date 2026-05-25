import { Global, Module } from '@nestjs/common';

import { TenantCronRunner } from './tenant-cron-runner';

@Global()
@Module({
  providers: [TenantCronRunner],
  exports: [TenantCronRunner],
})
export class RlsModule {}
