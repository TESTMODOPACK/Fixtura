'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Plus, Save, Shield } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { ColorSwatchPicker } from '@/components/ui/color-swatch-picker';
import { Input } from '@/components/ui/input';
import {
  FormErrorBanner,
  makeRhfErrorHandler,
} from '@/components/ui/form-errors';
import { useClubes, useCreateEquipo } from '@/hooks/use-admin';
import { parseApiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toastError, toastSuccess } from '@/lib/toast';

interface SerieOption {
  slug: string;
  nombre: string;
}

const EquipoFormSchema = z.object({
  nombre: z.string().min(2).max(150),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  colorPrimario: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Formato hex #RRGGBB'),
  serieSlug: z.string().optional(),
});
type EquipoForm = z.infer<typeof EquipoFormSchema>;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Form de inscripción de equipo a un torneo del modelo VIEJO (sin
 * categoriasSeries definidas). Si el torneo está bien configurado con
 * categorías nuevas, el admin debería usar la pestaña "Inscripciones →"
 * en su lugar — pero acá igual permitimos que reutilice clubes ya
 * cargados para evitar tipear los datos otra vez.
 *
 * Sprint 26C+: si hay clubes globales cargados en la liga, los muestra
 * como lista clickeable arriba del form. Al hacer click se autocompleta
 * todo (nombre, slug, color, escudo lo tendrá si el club lo tiene).
 * Si el admin prefiere crear desde cero, sigue habiendo opción
 * "Crear equipo nuevo desde cero".
 */
export function NuevoEquipoForm({
  torneoId,
  series,
  onDone,
}: {
  torneoId: string;
  /** Series disponibles si el torneo tiene categoría. Si no, vacío. */
  series?: SerieOption[];
  onDone: () => void;
}): React.ReactElement {
  const mutation = useCreateEquipo(torneoId);
  const { data: clubes, isLoading: loadingClubes } = useClubes();
  const tieneSeries = (series?.length ?? 0) > 0;

  // Modo del UI:
  //   'lista'   → mostrar clubes existentes (default si hay clubes activos)
  //   'manual'  → form completo de creación desde cero
  // Si NO hay clubes cargados, arrancamos directo en 'manual'.
  const [modo, setModo] = useState<'lista' | 'manual'>('lista');
  const clubesActivos = (clubes ?? []).filter((c) => c.estado === 'ACTIVO');

  // Si después de cargar resulta que no hay clubes, saltamos a 'manual'.
  useEffect(() => {
    if (!loadingClubes && clubesActivos.length === 0) {
      setModo('manual');
    }
  }, [loadingClubes, clubesActivos.length]);

  const form = useForm<EquipoForm>({
    resolver: zodResolver(EquipoFormSchema),
    defaultValues: { nombre: '', slug: '', colorPrimario: '#1B4332', serieSlug: '' },
  });

  const nombre = form.watch('nombre');
  useEffect(() => {
    if (modo !== 'manual') return;
    form.setValue('slug', slugify(nombre));
  }, [nombre, form, modo]);

  const inscribirDesdeClub = async (
    clubId: string,
  ): Promise<void> => {
    const club = clubesActivos.find((c) => c.id === clubId);
    if (!club) return;
    try {
      await mutation.mutateAsync({
        nombre: club.nombre,
        slug: club.slug,
        colorPrimario: club.colorPrimario ?? '#1B4332',
        colorSecundario: club.colorSecundario ?? null,
        escudoUrl: club.escudoUrl ?? null,
        serieSlug: null,
      });
      toastSuccess(`"${club.nombre}" inscrito en el torneo.`);
      onDone();
    } catch (err) {
      // mutation.error queda visible en banner inline; toast adicional
      // por si el usuario está scrolleado en una lista larga.
      toastError(err);
    }
  };

  const onSubmit = async (vals: EquipoForm): Promise<void> => {
    try {
      await mutation.mutateAsync({
        nombre: vals.nombre,
        slug: vals.slug,
        colorPrimario: vals.colorPrimario,
        serieSlug: tieneSeries && vals.serieSlug ? vals.serieSlug : null,
      });
      toastSuccess(`Equipo "${vals.nombre}" inscrito.`);
      onDone();
    } catch (err) {
      toastError(err);
    }
  };

  const error = mutation.error;

  // ── Modo "lista": elegir club existente ─────────────────────────
  if (modo === 'lista') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-green-deep">
            → Inscribir un club existente
          </div>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => setModo('manual')}
          >
            <Plus size={12} /> Crear equipo nuevo desde cero
          </Button>
        </div>

        {loadingClubes && (
          <p className="font-serif italic text-ink-mute text-sm">
            Cargando clubes…
          </p>
        )}

        {!loadingClubes && clubesActivos.length === 0 && (
          <Card padding="comfortable" variant="lime">
            <p className="text-sm text-green-deep/85">
              Todavía no hay clubes cargados en la liga. Podés crear el equipo
              directamente desde cero acá abajo, o ir a{' '}
              <Link
                href="/admin/clubes/nuevo"
                className="text-accent font-semibold hover:underline"
              >
                /admin/clubes
              </Link>{' '}
              y crear primero la ficha del club (recomendado — los datos te
              quedan disponibles para futuros torneos).
            </p>
          </Card>
        )}

        {clubesActivos.length > 0 && (
          <ul className="divide-y divide-line border border-line rounded-card overflow-hidden">
            {clubesActivos.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => inscribirDesdeClub(c.id)}
                  disabled={mutation.isPending}
                  className={cn(
                    'w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-paper transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  <div
                    className="w-9 h-9 rounded-full flex-shrink-0 border border-line flex items-center justify-center"
                    style={{ backgroundColor: c.colorPrimario ?? '#888278' }}
                  >
                    {c.escudoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.escudoUrl}
                        alt={c.nombre}
                        className="w-full h-full object-contain rounded-full"
                      />
                    ) : (
                      <Shield size={14} className="text-chalk" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-ink truncate">
                      {c.nombre}
                    </div>
                    <div className="text-xs text-ink-mute font-mono">
                      {c.slug} · {c.jugadoresCount} jugador
                      {c.jugadoresCount === 1 ? '' : 'es'}
                    </div>
                  </div>
                  <ArrowRight
                    size={14}
                    className="text-accent flex-shrink-0"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}

        <FormErrorBanner
          apiError={error}
          apiTitle="No se pudo inscribir el club al torneo"
        />
      </div>
    );
  }

  // ── Modo "manual": form de creación desde cero ──────────────────
  return (
    <form
      onSubmit={form.handleSubmit(
        onSubmit,
        makeRhfErrorHandler({ formName: 'nuevo-equipo-manual' }),
      )}
      className="space-y-3"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-green-deep">
          → Crear equipo desde cero
        </div>
        {clubesActivos.length > 0 && (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => setModo('lista')}
          >
            ← Elegir un club existente
          </Button>
        )}
      </div>

      <div
        className={`grid grid-cols-1 ${tieneSeries ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-3`}
      >
        <Input
          label="Nombre del equipo"
          placeholder="Halcones FC"
          autoFocus
          {...form.register('nombre')}
          error={form.formState.errors.nombre?.message}
        />
        <Input
          label="Slug"
          {...form.register('slug')}
          error={form.formState.errors.slug?.message}
        />
        {tieneSeries && (
          <div>
            <label className="label">Serie</label>
            <select className="input" {...form.register('serieSlug')}>
              <option value="">— Sin serie —</option>
              {series?.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <ColorSwatchPicker
        label="Color del equipo"
        value={form.watch('colorPrimario') ?? ''}
        onChange={(hex) =>
          form.setValue('colorPrimario', hex, {
            shouldValidate: true,
            shouldDirty: true,
          })
        }
        error={form.formState.errors.colorPrimario?.message}
      />

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" variant="accent" size="sm" loading={mutation.isPending}>
          <Save size={14} /> Inscribir
        </Button>
        {error && (
          <span className="text-xs text-danger flex-1">
            {parseApiErrorMessage(error)}
          </span>
        )}
      </div>
    </form>
  );
}
