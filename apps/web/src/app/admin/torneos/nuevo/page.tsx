'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
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

// Labels legibles por campo para el banner de errores.
const FIELD_LABEL: Record<string, string> = {
  nombre: 'Nombre',
  slug: 'Slug',
  temporadaId: 'Temporada',
  tipoFormato: 'Formato',
  ruedas: 'Ruedas',
  puntosVictoria: 'Puntos por victoria',
  puntosEmpate: 'Puntos por empate',
  puntosDerrota: 'Puntos por derrota',
};

export default function NuevoTorneoPage(): React.ReactElement {
  const router = useRouter();
  const { data: temporadas, isLoading: loadingTemporadas } = useTemporadas();
  const createTemporada = useCreateTemporada();
  const createTorneo = useCreateTorneo();
  const errorBannerRef = useRef<HTMLDivElement | null>(null);

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
    // Re-validar mientras tipea — para que el slug muestre su error
    // apenas el usuario haga `min < 3`.
    mode: 'onChange',
  });

  // Auto-slugify: solo si el usuario NO tocó manualmente el campo slug.
  // form.formState.dirtyFields.slug se marca true en cuanto hay un onChange
  // explícito del usuario en ese input.
  const nombre = form.watch('nombre');
  useEffect(() => {
    const slugTocado = form.formState.dirtyFields.slug === true;
    if (!slugTocado) {
      const auto = slugify(nombre);
      if (auto !== form.getValues('slug')) {
        // shouldValidate true para que el error del min(3) refresque.
        form.setValue('slug', auto, { shouldValidate: true, shouldDirty: false });
      }
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

  // Si la validación falla, scrolleamos al banner de errores + focus al
  // primer campo con error. Sin esto, el "Crear torneo" parecía no hacer
  // nada cuando el error estaba lejos del botón.
  const onError = (errors: Record<string, unknown>): void => {
    // eslint-disable-next-line no-console
    console.warn('[nuevo-torneo] validación falló:', errors);
    if (errorBannerRef.current) {
      errorBannerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const primerCampoConError = Object.keys(errors)[0];
    if (primerCampoConError) {
      // Pequeño delay para que el scroll no compita con el focus.
      setTimeout(() => {
        const el = document.querySelector<HTMLElement>(
          `[name="${primerCampoConError}"]`,
        );
        el?.focus();
      }, 250);
    }
  };

  const apiError = (createTorneo.error ?? createTemporada.error) as ApiError | undefined;
  const formErrors = form.formState.errors;
  // Lista completa de errores para el banner visible.
  const erroresParaMostrar = Object.entries(formErrors)
    .map(([campo, err]) => {
      const errObj = err as { message?: string } | undefined;
      return { campo, label: FIELD_LABEL[campo] ?? campo, mensaje: errObj?.message ?? 'inválido' };
    })
    .filter((e) => e.mensaje);

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

      {/* Banner de errores AL TOPE — siempre visible cuando hay problemas */}
      {(erroresParaMostrar.length > 0 || apiError) && (
        <div
          ref={errorBannerRef}
          className="mb-5 bg-danger/10 border-2 border-danger/40 rounded-card px-4 py-3"
        >
          <div className="flex items-start gap-2 text-danger">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-sm">
                {apiError ? 'No se pudo crear el torneo' : 'Revisá los campos marcados:'}
              </div>
              {apiError && (
                <div className="text-sm mt-1">{apiError.message}</div>
              )}
              {erroresParaMostrar.length > 0 && (
                <ul className="text-sm mt-1 space-y-0.5">
                  {erroresParaMostrar.map((e) => (
                    <li key={e.campo}>
                      <span className="font-semibold">{e.label}:</span> {e.mensaje}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

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

            <div>
              <Input
                label="Slug (URL)"
                placeholder="apertura-2026"
                {...form.register('slug')}
                error={form.formState.errors.slug?.message}
              />
              <p className="text-xs text-ink-mute font-serif italic mt-1">
                Se autocompleta desde el nombre. Mínimo 3 caracteres, solo minúsculas, números y
                guiones.
              </p>
            </div>

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
