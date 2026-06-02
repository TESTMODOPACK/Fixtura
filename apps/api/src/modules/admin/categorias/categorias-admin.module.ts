import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CategoriaJugadores } from '../../competition/entities/categoria-jugadores.entity';
import { CategoriasAdminController } from './categorias-admin.controller';
import { CategoriasAdminService } from './categorias-admin.service';

@Module({
  imports: [TypeOrmModule.forFeature([CategoriaJugadores])],
  controllers: [CategoriasAdminController],
  providers: [CategoriasAdminService],
  exports: [CategoriasAdminService],
})
export class CategoriasAdminModule {}
