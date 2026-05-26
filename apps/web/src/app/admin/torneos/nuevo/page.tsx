'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import { useCreateTemporada, useCreateTorneo, useTemporadas } from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';

const TorneoFormSchema = z.object({
  // temporadaId puede venir vacío: si no hay temporadas todavía, el
  // submit la crea automáticamente vía ensureTemporadaActual().
  temporadaId: z.union([z.literal(''), z.uuid('Elegí una temporada válida')]),
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(200),
  slug: z
    .string()
    .min(3, 'Mínimo 3 caracteres')
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  tipoFormato: z.enum(['ROUND_ROBIN', 'PLAYOFFS', 'GROUPS', 'MIXTO']),
  ruedas: z.union([z.literal(1), z.literal(2)]),
  puntosVictoria: z.coerce.number().int().min(0).max(10),
  puntosEmpate: z.coerce.number().int().min(0).max(10),
  puntosDerrota: z.coerce.number().int().min(0).max(10),
});
type TorneoForm = z.infer<typeof TorneoFormSchema>;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    // Borra los combining diacritical marks (acentos/tildes) usando
    // escape unicode explícito para que no se rompa por encoding.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function NuevoTorneoPage(): React.ReactElement {
  const router = useRouter();
  const { data: temporadas, isLoading: loadingTemporadas } = useTemporadas();
  const createTemporada = useCreateTemporada();
  const createTorneo = useCreateTorneo();

  const form = useForm<TorneoForm>({
    resolver: zodResolver(TorneoFormSchema),
    defaultValues: {
      temporadaId: '',
      nombre: '',
      slug: '',
      tipoFormato: 'ROUND_ROBIN',
      ruedas: 1,
      puntosVictoria: 3,
      puntosEmpate: 1,
      puntosDerrota: 0,
    },
  });

  // Auto-slugify desde el nombre mientras el slug esté vacío o sin tocar
  const nombre = form.watch('nombre');
  useEffect(() => {
    const slug = form.getValues('slug');
    if (!slug || slug === slugify(form.formState.defaultValues?.nombre ?? '')) {
      form.setValue('slug', slugify(nombre));
    }
  }, [nombre, form]);

  // Si no hay temporadas, creamos una "Temporada YYYY" para destrabar
  const ensureTemporadaActual = async (): Promise<string> => {
    if (temporadas && temporadas.length > 0) {
      return temporadas[0]!.id;
    }
    const anioActual = new Date().getFullYear();
    const t = await createTemporada.mutateAsync({
      nombre: `Temporada ${anioActual}`,
      anio: anioActual,
    });
    return t.id;
  };

  // Pre-seleccionar primera temporada cuando carguen
  useEffect(() => {
    if (temporadas && temporadas.length > 0 && !form.getValues('temporadaId')) {
      form.setValue('temporadaId', temporadas[0]!.id);
    }
  }, [temporadas, form]);

  const onSubmit = async (vals: TorneoForm): Promise<void> => {
    let temporadaId = vals.temporadaId;
    if (!temporadaId) {
      temporadaId = await ensureTemporadaActual();
    }
    const torneo = await createTorneo.mutateAsync({
      temporadaId,
      nombre: vals.nombre,
      slug: vals.slug,
      tipoFormato: vals.tipoFormato,
      ruedas: vals.ruedas,
      puntosVictoria: vals.puntosVictoria,
      puntosEmpate: vals.puntosEmpate,
      puntosDerrota: vals.puntosDerrota,
    });
    router.push(`/admin/torneos/${torneo.id}`);
  };

  // Si el form falla validación zod, mostramos el primer error como
  // banner global. Sin esto, los campos ocultos (como el select de
  // temporada cuando aún no hay temporadas) hacían que el submit no
  // hiciera nada visible.
  const onError = (errors: Record<string, { message?: string } | undefined>): void => {
    // eslint-disable-next-line no-console
    console.warn('[nuevo-torneo] validación falló:', errors);
  };

  const apiError = (createTorneo.error ?? createTemporada.error) as ApiError | undefined;
  const formErrors = form.formState.errors;
  const primerErrorMensaje =
    formErrors.nombre?.message ??
    formErrors.slug?.message ??
    formErrors.temporadaId?.message ??
    formErrors.puntosVictoria?.message ??
    formErrors.puntosEmpate?.message ??
    formErrors.puntosDerrota?.message ??
    null;

  return (
    <>
      <PageHead
        eyebrow="Competición · Crear torneo"
        title="Nuevo torneo"
        sub="Configura los parámetros básicos. Los equipos y el fixture se agregan después."
      >
        <Link href="/admin/torneos">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Cancelar
          </Button>
        </Link>
      </PageHead>

      <form
        onSubmit={form.handleSubmit(onSubmit, onError)}
        className="grid grid-cols-1 lg:grid-cols-3 gap-5"
      >
        <Card padding="roomy" className="lg:col-span-2">
          <CardLabel>Datos principales</CardLabel>

          <div className="space-y-4 mt-4">
            <Input
              label="Nombre del torneo"
              placeholder="Apertura 2026"
              autoFocus
              {...form.register('nombre')}
              error={form.formState.errors.nombre?.message}
            />

            <Input
              label="Slug (URL)"
              placeholder="apertura-2026"
              {...form.register('slug')}
              error={form.formState.errors.slug?.message}
            />

            <div>
              <label className="label">Temporada</label>
              {loadingTemporadas ? (
                <div className="font-serif italic text-ink-mute text-sm py-2">Cargando...</div>
              ) : temporadas && temporadas.length > 0 ? (
                <select className="input" {...form.register('temporadaId')}>
                  {temporadas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre} ({t.anio})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-ink-mute font-serif italic">
                  No tenés temporadas. Creamos una automáticamente al guardar.
                </div>
              )}
              {form.formState.errors.temporadaId && (
                <p className="text-xs text-danger mt-1">{form.formState.errors.temporadaId.message}</p>
              )}
            </div>

            <div>
              <label className="label">Formato</label>
              <select className="input" {...form.register('tipoFormato')}>
                <option value="ROUND_ROBIN">Round Robin (todos contra todos)</option>
                <option value="PLAYOFFS" disabled>
                  Playoffs (próximo)
                </option>
                <option value="GROUPS" disabled>
                  Grupos (próximo)
                </option>
                <option value="MIXTO" disabled>
                  Mixto (próximo)
                </option>
              </select>
            </div>

            <div>
              <label className="label">Ruedas</label>
              <select
                className="input"
                {...form.register('ruedas', { valueAsNumber: true })}
              >
                <option value={1}>1 — solo ida</option>
                <option value={2}>2 — ida y vuelta</option>
              </select>
            </div>
          </div>
        </Card>

        <Card padding="roomy">
          <CardLabel>Sistema de puntos</CardLabel>

          <div className="space-y-4 mt-4">
            <Input
              label="Por victoria"
              type="number"
              min={0}
              max={10}
              {...form.register('puntosVictoria', { valueAsNumber: true })}
              error={form.formState.errors.puntosVictoria?.message}
            />
            <Input
              label="Por empate"
              type="number"
              min={0}
              max={10}
              {...form.register('puntosEmpate', { valueAsNumber: true })}
              error={form.formState.errors.puntosEmpate?.message}
            />
            <Input
              label="Por derrota"
              type="number"
              min={0}
              max={10}
              {...form.register('puntosDerrota', { valueAsNumber: true })}
              error={form.formState.errors.puntosDerrota?.message}
            />

            <p className="font-serif italic text-xs text-ink-mute">
              Lo estándar es 3 / 1 / 0. Algunas ligas usan 4 / 2 / 1 para premiar el juego.
            </p>
          </div>
        </Card>

        <div className="lg:col-span-3">
          {primerErrorMensaje && !apiError && (
            <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-card mb-3">
              No se pudo crear el torneo: {primerErrorMensaje}
            </div>
          )}
          {apiError && (
            <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-card mb-3">
              {apiError.message}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              variant="accent"
              loading={createTorneo.isPending || createTemporada.isPending}
            >
              <Save size={14} /> Crear torneo
            </Button>
            <Link href="/admin/torneos">
              <Button variant="ghost" size="sm">
                Cancelar
              </Button>
            </Link>
          </div>
        </div>
      </form>
    </>
  );
}
