'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Building2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { makeRhfErrorHandler } from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import {
  useCrearTenantPlataforma,
  usePlanesSuscripcion,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';

const Schema = z.object({
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  nombre: z.string().min(2).max(200),
  tipo: z.enum(['LIGA', 'RECINTO', 'FEDERACION']),
  planSlug: z.string().optional(),
  trialDias: z.coerce.number().int().min(0).max(365),
  adminEmail: z.string().email().optional().or(z.literal('')),
  adminNombre: z.string().optional(),
  adminApellido: z.string().optional(),
  adminPassword: z.string().optional(),
});
type FormData = z.infer<typeof Schema>;

export default function NuevoTenantPage(): React.ReactElement {
  const router = useRouter();
  const { data: planes } = usePlanesSuscripcion();
  const crear = useCrearTenantPlataforma();

  const form = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: {
      tipo: 'LIGA',
      trialDias: 30,
      planSlug: 'starter',
    },
  });

  const onSubmit = form.handleSubmit(
    async (data) => {
      try {
        const r = await crear.mutateAsync({
          slug: data.slug,
          nombre: data.nombre,
          tipo: data.tipo,
          planSlug: data.planSlug || undefined,
          trialDias: data.trialDias,
          adminEmail: data.adminEmail || undefined,
          adminNombre: data.adminNombre || undefined,
          adminApellido: data.adminApellido || undefined,
          adminPassword: data.adminPassword || undefined,
        });
        router.push(`/admin/super/tenants/${r.id}`);
      } catch {
        // MutationCache global dispara toastError; el banner abajo
        // muestra el detalle del error.
      }
    },
    makeRhfErrorHandler({ formName: 'nuevo-tenant' }),
  );

  const error = crear.error as ApiError | undefined;

  return (
    <>
      <PageHead
        eyebrow="Plataforma"
        title="Registrar nueva liga"
        sub="Alta de una liga, recinto o federación. Opcionalmente podés crear el usuario administrador inicial."
      >
        <Link href="/admin/super/tenants">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Listado de ligas
          </Button>
        </Link>
      </PageHead>

      <form onSubmit={onSubmit} className="space-y-5">
        <Card padding="comfortable">
          <CardLabel>Datos de la liga</CardLabel>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div>
              <label className="label">Slug (URL: fixtura.cl/&lt;slug&gt;)</label>
              <Input placeholder="liga-nunoa" {...form.register('slug')} />
              {form.formState.errors.slug && (
                <p className="text-xs text-danger mt-1">{form.formState.errors.slug.message}</p>
              )}
            </div>
            <div>
              <label className="label">Nombre comercial</label>
              <Input placeholder="Liga Ñuñoa Amateur" {...form.register('nombre')} />
              {form.formState.errors.nombre && (
                <p className="text-xs text-danger mt-1">{form.formState.errors.nombre.message}</p>
              )}
            </div>
            <div>
              <label className="label">Tipo</label>
              <select className="input" {...form.register('tipo')}>
                <option value="LIGA">Liga</option>
                <option value="RECINTO">Recinto</option>
                <option value="FEDERACION">Federación</option>
              </select>
            </div>
            <div>
              <label className="label">Plan</label>
              <select className="input" {...form.register('planSlug')}>
                <option value="">— sin plan —</option>
                {planes?.filter((p) => p.activo).map((p) => (
                  <option key={p.id} value={p.slug}>
                    {p.nombre} (${p.precioMensualClp.toLocaleString('es-CL')}/mes)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Días de prueba</label>
              <Input type="number" min={0} max={365} {...form.register('trialDias')} />
              <p className="text-xs text-ink-mute italic mt-1">
                0 = sin período de prueba, activar de inmediato. 30 = un mes de prueba.
              </p>
            </div>
          </div>
        </Card>

        <Card padding="comfortable">
          <CardLabel>Administrador inicial (opcional)</CardLabel>
          <p className="text-xs text-ink-mute italic mt-1 mb-3">
            Si lo dejás vacío, la liga queda creada sin usuario asociado y lo agregás
            después. Si completás los datos, se crea el usuario con rol de
            Administrador de Liga sobre esta liga.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Email</label>
              <Input type="email" placeholder="admin@liga.cl" {...form.register('adminEmail')} />
            </div>
            <div>
              <label className="label">Password temporal (mín 8)</label>
              <Input type="text" {...form.register('adminPassword')} />
            </div>
            <div>
              <label className="label">Nombre</label>
              <Input {...form.register('adminNombre')} />
            </div>
            <div>
              <label className="label">Apellido</label>
              <Input {...form.register('adminApellido')} />
            </div>
          </div>
        </Card>

        {error && (
          <Card padding="comfortable" className="border-2 border-danger/40 bg-danger/5">
            <div className="text-sm text-danger">{error.message}</div>
          </Card>
        )}

        <div className="flex gap-3">
          <Button type="submit" variant="accent" disabled={crear.isPending}>
            <Building2 size={14} /> {crear.isPending ? 'Creando…' : 'Crear liga'}
          </Button>
          <Link href="/admin/super/tenants">
            <Button type="button" variant="default">
              Cancelar
            </Button>
          </Link>
        </div>
      </form>
    </>
  );
}
