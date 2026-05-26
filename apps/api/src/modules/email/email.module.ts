import { Global, Module } from '@nestjs/common';

import { EmailService } from './email.service';

/**
 * EmailService es global porque varios módulos lo necesitan
 * (designaciones, tribunal, magic links de invitación futura, etc.).
 */
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
