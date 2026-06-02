import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class CreateInscripcionDto {
  @IsUUID()
  clubId!: string;

  @IsUUID()
  categoriaId!: string;

  @IsOptional()
  @IsString()
  @Length(2, 50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug solo admite minúsculas, números y guiones',
  })
  serieSlug?: string | null;
}

export class AddJugadorPlanillaDto {
  @IsUUID()
  jugadorId!: string;
}
