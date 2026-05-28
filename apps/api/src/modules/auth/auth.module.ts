import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MagicLinksService } from './magic-links.service';
import { MagicLink } from './entities/magic-link.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { UsersModule } from '../users/users.module';

/**
 * `@Global()` y `exports: [JwtModule]` son necesarios porque el
 * JwtAuthGuard se registra como guard global desde AppModule (via
 * APP_GUARD). Sin esto, Nest no puede inyectar JwtService en el guard
 * y crashea al bootstrap con UnknownDependenciesException.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshToken, MagicLink]),
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        // expiresIn es `StringValue` (template literal de `ms`), pero
        // viene de env var como string crudo. Validamos formato en
        // .env.example. Cast pragmático para evitar fricción de tipos.
        signOptions: {
          expiresIn: config.get<string>('JWT_ACCESS_TTL', '15m') as `${number}m`,
        },
      }),
    }),
  ],
  providers: [AuthService, MagicLinksService],
  controllers: [AuthController],
  exports: [AuthService, MagicLinksService, JwtModule],
})
export class AuthModule {}
