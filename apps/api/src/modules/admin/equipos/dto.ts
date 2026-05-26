import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class CreateEquipoDto {
  @IsString()
  @Length(2, 150)
  nombre!: string;

  @IsString()
  @Length(2, 100)
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug solo admite minúsculas, números y guiones' })
  slug!: string;

  @IsOptional()
  @IsString()
  escudoUrl?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Color en formato hex #RRGGBB' })
  colorPrimario?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Color en formato hex #RRGGBB' })
  colorSecundario?: string | null;

  @IsOptional()
  @IsUUID()
  delegadoUserId?: string | null;
}
