import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PagosModule } from '../admin/pagos/pagos.module';
import { SIIModule } from '../admin/sii/sii.module';
import { DocumentoTributario } from '../competition/entities/documento-tributario.entity';
import { Transaccion } from '../competition/entities/transaccion.entity';
import { EmailModule } from '../email/email.module';
import { PlanSuscripcion } from '../tenants/entities/plan-suscripcion.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/entities/user-role.entity';
import { AppConfigModule } from './app-config.module';
import { FacturaPlataforma } from './entities/factura-plataforma.entity';
import { FacturacionPlataformaCron } from './facturacion-plataforma.cron';
import { FacturacionPlataformaPagosService } from './facturacion-plataforma-pagos.service';
import { FacturacionPlataformaService } from './facturacion-plataforma.service';
import {
  MERCADOPAGO_PROVIDER,
  MercadoPagoMockProvider,
  MercadoPagoProvider,
  MercadoPagoRealProvider,
} from './mercadopago-provider';
import { MiSuscripcionController } from './mi-suscripcion.controller';
import {
  SuperAdminFacturasController,
  SuperAdminMetricsController,
  SuperAdminPlanesController,
  SuperAdminPortalConfigController,
  SuperAdminTenantsController,
} from './super-admin.controller';
import { SuperAdminMetricsService } from './super-admin-metrics.service';
import { SuperAdminPlanesService } from './super-admin-planes.service';
import { SuperAdminTenantsService } from './super-admin-tenants.service';

/**
 * Sprint 23 — Módulo del super admin de plataforma.
 * Sprint 24A — Suma facturación plataforma + endpoint mi-suscripción.
 *
 * Endpoints super admin /super-admin/* requieren rol SUPER_ADMIN.
 * Internamente hacen bypass de RLS para ver datos cross-tenant.
 *
 * Endpoint LIGA_ADMIN /admin/mi-suscripcion/* permite ver y pagar las
 * facturas propias de la liga.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tenant,
      PlanSuscripcion,
      User,
      UserRole,
      FacturaPlataforma,
      Transaccion,
      DocumentoTributario,
    ]),
    PagosModule,
    SIIModule,
    EmailModule,
    AppConfigModule,
  ],
  controllers: [
    SuperAdminTenantsController,
    SuperAdminPlanesController,
    SuperAdminMetricsController,
    SuperAdminFacturasController,
    SuperAdminPortalConfigController,
    MiSuscripcionController,
  ],
  providers: [
    SuperAdminTenantsService,
    SuperAdminPlanesService,
    SuperAdminMetricsService,
    FacturacionPlataformaService,
    FacturacionPlataformaPagosService,
    FacturacionPlataformaCron,
    MercadoPagoMockProvider,
    MercadoPagoRealProvider,
    {
      provide: MERCADOPAGO_PROVIDER,
      inject: [MercadoPagoMockProvider, MercadoPagoRealProvider],
      useFactory: (
        mock: MercadoPagoMockProvider,
        real: MercadoPagoRealProvider,
      ): MercadoPagoProvider => {
        const mode = (process.env.MERCADOPAGO_MODE ?? 'mock').toLowerCase();
        if (mode === 'sandbox' || mode === 'production') return real;
        return mock;
      },
    },
  ],
  exports: [FacturacionPlataformaService, FacturacionPlataformaPagosService],
})
export class SuperAdminModule {}
