import { IsEnum, IsString, Length, Matches } from 'class-validator';

import { PLAN, TENANT_TYPE } from '@fixtura/types';

export class CreateTenantDto {
  @IsString()
  @Length(3, 50)
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug solo admite minúsculas, números y guiones' })
  slug!: string;

  @IsString()
  @Length(2, 200)
  nombre!: string;

  @IsEnum(TENANT_TYPE)
  tipo!: keyof typeof TENANT_TYPE;

  @IsEnum(PLAN)
  plan: keyof typeof PLAN = 'STARTER';
}
