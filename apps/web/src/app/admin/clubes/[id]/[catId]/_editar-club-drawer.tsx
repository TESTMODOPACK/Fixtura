'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Club } from '@fixtura/types';
import { AlertTriangle, Info, Plus, Save, Users, X } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { CardLabel } from '@/components/ui/card';
import { ColorSwatchPicker } from '@/components/ui/color-swatch-picker';
import {
  FormErrorBanner,
  makeRhfErrorHandler,
  rhfErrorsToBanner,
} from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import { useCategorias, useUpdateClub } from '@/hooks/use-admin';
import { cn } from '@/lib/cn';
import { toastError, toastSuccess } from '@/lib/toast';

/**
 * Sprint 32 — drawer para editar los datos transversales del club
 * (nombre, escudo, colores, página web, reseña) y el set de categorías
 * en las que participa. Todo lo de aquí afecta a TODAS las categorías
 * del club.
 *
 * Las categorías nuevas que se agregan heredan la directiva "madre"
 * del club como punto de partida (el backend lo hace automático en
 * sincronizarCategorias). Las que se quitan deben tener 0 jugadores
 * cargados, sino el backend rechaza con detalle.
 *
 * NO incluye la directiva (eso se edita por categoría en la ficha).
 */

const optionalEmail = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.email('Email inválido').max(150).optional(),
);

const optionalUrl = z.preprocess(
  (v) => {
    if (typeof v !== 'string') return v;
    const t = v.trim();
    if (t === '') return undefined;
    if (/^https?:\/\//.test(t)) return t;
    return `https://${t}`;
  },
  z.url('URL inválida — usa formato https://dominio.com').max(500).optional(),
);

const FormSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(150),
  escudoUrl: optionalUrl,
  colorPrimario: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Formato #RRGGBB'),
  colorSecundario: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Formato #RRGGBB')
    .or(z.literal(''))
    .optional(),
  paginaWeb: optionalUrl,
  resena: z.string().max(2000).optional(),
  categoriaIds: z
    .array(z.uuid())
    .min(1, 'El club debe tener al menos una categoría asignada.'),
});
type FormData = z.infer<typeof FormSchema>;

const FIELD_LABEL: Record<string, string> = {
  nombre: 'Nombre',
  escudoUrl: 'Escudo',
  colorPrimario: 'Color primario',
  colorSecundario: 'Color secundario',
  paginaWeb: 'Página web',
  resena: 'Reseña',
  categoriaIds: 'Categorías',
};

export function EditarClubDrawer({
  club,
  open,
  onClose,
}: {
  club: Club;
  open: boolean;
  onClose: () => void;
}): React.ReactElement | null {
  const mutation = useUpdateClub(club.id);
  const { data: categorias } = useCategorias();

  const form = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      nombre: club.nombre,
      escudoUrl: club.escudoUrl ?? '',
      colorPrimario: club.colorPrimario ?? '#1B4332',
      colorSecundario: club.colorSecundario ?? '',
      paginaWeb: club.paginaWeb ?? '',
      resena: club.resena ?? '',
      categoriaIds: club.categoriaIds,
    },
    mode: 'onChange',
  });

  // Reset al cambiar el club abierto (o al re-abrir).
  useEffect(() => {
    if (open) {
      form.reset({
        nombre: club.nombre,
        escudoUrl: club.escudoUrl ?? '',
        colorPrimario: club.colorPrimario ?? '#1B4332',
        colorSecundario: club.colorSecundario ?? '',
        paginaWeb: club.paginaWeb ?? '',
        resena: club.resena ?? '',
        categoriaIds: club.categoriaIds,
      });
    }
  }, [open, club.id, club.nombre, club.escudoUrl, club.colorPrimario, club.colorSecundario, club.paginaWeb, club.resena, club.categoriaIds, form]);

  // ESC cierra el drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const seleccionadas = form.watch('categoriaIds');

  const toggleCategoria = (catId: string): void => {
    const actuales = form.getValues('categoriaIds');
    const next = actuales.includes(catId)
      ? actuales.filter((x) => x !== catId)
      : [...actuales, catId];
    form.setValue('categoriaIds', next, {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  const onSubmit = async (vals: FormData): Promise<void> => {
    try {
      await mutation.mutateAsync({
        nombre: vals.nombre.trim(),
        escudoUrl: vals.escudoUrl?.trim() || null,
        colorPrimario: vals.colorPrimario,
        colorSecundario: vals.colorSecundario?.trim() || null,
        paginaWeb: vals.paginaWeb?.trim() || null,
        resena: vals.resena?.trim() || null,
        categoriaIds: vals.categoriaIds,
      });
      toastSuccess('Datos del club actualizados.');
      onClose();
    } catch (err) {
      // El backend rechaza con ConflictException si se intenta quitar
      // una categoría que tiene jugadores cargados. El toast lo muestra
      // automáticamente vía MutationCache global.
      toastError(err);
    }
  };

  const apiError = mutation.error;
  const fieldErrors = rhfErrorsToBanner(
    form.formState.errors as Record<string, unknown>,
    FIELD_LABEL,
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-ink/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-paper w-full max-w-2xl h-full overflow-y-auto shadow-2xl">
        <div className="flex items-start justify-between px-6 py-4 border-b border-line sticky top-0 bg-paper z-10">
          <div>
            <div className="font-display text-xl text-green-deep tracking-display">
              Editar datos del club
            </div>
            <p className="text-xs font-serif italic text-ink-mute mt-1">
              Estos cambios afectan a <b>todas las categorías</b> de {club.nombre}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-mute hover:text-ink"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={form.handleSubmit(
            onSubmit,
            makeRhfErrorHandler({ formName: 'editar-club' }),
          )}
          className="p-6 space-y-5"
        >
          <FormErrorBanner
            fieldErrors={fieldErrors}
            apiError={apiError}
            apiTitle="No se pudo guardar"
          />

          <div>
            <CardLabel>Identidad</CardLabel>
            <div className="space-y-3 mt-3">
              <Input
                label="Nombre"
                placeholder="Halcones FC"
                {...form.register('nombre')}
                error={form.formState.errors.nombre?.message}
              />
              <Input
                label="URL del escudo (opcional)"
                placeholder="https://ejemplo.com/escudo.png"
                {...form.register('escudoUrl')}
                error={form.formState.errors.escudoUrl?.message as string}
              />
              <Input
                label="Página web (opcional)"
                placeholder="halconesfc.cl"
                {...form.register('paginaWeb')}
                error={form.formState.errors.paginaWeb?.message as string}
              />
            </div>
          </div>

          <div>
            <CardLabel>Categorías del club</CardLabel>

            {/* Info-box explicativo */}
            <div className="bg-green-bright/10 border border-green-bright/30 rounded-card px-3 py-2 mt-2 mb-4 flex items-start gap-2 text-xs">
              <Info size={14} className="flex-shrink-0 mt-0.5 text-green-bright" />
              <div className="space-y-1 text-green-deep/90">
                <div>
                  Cada categoría tiene su propia directiva y plantel — un mismo
                  club puede competir en varias.
                </div>
                <div>
                  Al <b>agregar una categoría nueva</b>, hereda la directiva
                  actual del club como punto de partida. Después puedes ajustarla
                  desde la ficha de esa categoría.
                </div>
              </div>
            </div>

            {/* Categorías actuales del club */}
            {(() => {
              const actuales = (categorias ?? []).filter((c) =>
                club.categoriaIds.includes(c.id),
              );
              if (actuales.length === 0) return null;
              return (
                <div className="mb-4">
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-mute mb-2">
                    Asignadas actualmente ({actuales.length})
                  </div>
                  <div className="space-y-2">
                    {actuales.map((c) => {
                      const detalle = club.categoriasDetalle.find(
                        (d) => d.categoriaId === c.id,
                      );
                      const sigue = seleccionadas.includes(c.id);
                      const aQuitar = !sigue;
                      const tieneJugadores = (detalle?.jugadoresCount ?? 0) > 0;
                      return (
                        <div
                          key={c.id}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2 rounded-card border',
                            aQuitar
                              ? 'bg-danger/5 border-danger/30'
                              : 'bg-paper border-line',
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div
                              className={cn(
                                'font-semibold text-sm',
                                aQuitar && 'line-through text-ink-mute',
                              )}
                            >
                              {c.nombre}
                            </div>
                            <div className="text-[10px] text-ink-mute flex items-center gap-2 mt-0.5">
                              <span>Mín. {c.edadMinimaGeneral} años</span>
                              {detalle && (
                                <span className="flex items-center gap-0.5">
                                  <Users size={10} />
                                  {detalle.jugadoresCount} jugador
                                  {detalle.jugadoresCount === 1 ? '' : 'es'}
                                </span>
                              )}
                            </div>
                          </div>
                          {aQuitar ? (
                            <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-danger/15 text-danger">
                              Se va a quitar
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => toggleCategoria(c.id)}
                            disabled={tieneJugadores && !aQuitar}
                            title={
                              tieneJugadores && !aQuitar
                                ? `No se puede quitar: ${detalle?.jugadoresCount} jugador(es) cargados. Elimínalos primero desde la ficha.`
                                : aQuitar
                                  ? 'Deshacer (mantener asignada)'
                                  : 'Quitar del club'
                            }
                            className={cn(
                              'h-8 w-8 rounded-card flex items-center justify-center transition-colors',
                              tieneJugadores && !aQuitar
                                ? 'text-ink-mute/40 cursor-not-allowed'
                                : aQuitar
                                  ? 'text-accent hover:bg-accent/10'
                                  : 'text-ink-mute hover:bg-danger/10 hover:text-danger',
                            )}
                            aria-label={
                              aQuitar ? 'Deshacer quitar' : 'Quitar categoría'
                            }
                          >
                            {aQuitar ? <Plus size={14} /> : <X size={14} />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Categorías disponibles para agregar */}
            {(() => {
              const disponibles = (categorias ?? []).filter(
                (c) => c.activa && !club.categoriaIds.includes(c.id),
              );
              if (disponibles.length === 0) {
                return (
                  <div className="text-xs font-serif italic text-ink-mute">
                    No hay otras categorías disponibles. Crea categorías nuevas
                    desde{' '}
                    <a
                      href="/admin/categorias"
                      className="text-accent hover:underline"
                    >
                      /admin/categorías
                    </a>
                    .
                  </div>
                );
              }
              return (
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-mute mb-2">
                    Agregar otra categoría ({disponibles.length} disponible
                    {disponibles.length === 1 ? '' : 's'})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {disponibles.map((c) => {
                      const aAgregar = seleccionadas.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleCategoria(c.id)}
                          className={cn(
                            'px-3 py-2 rounded-card border text-sm flex items-center gap-2 transition-colors',
                            aAgregar
                              ? 'bg-green-bright/15 border-green-bright text-green-deep'
                              : 'bg-paper border-line border-dashed text-ink-mute hover:border-green-bright hover:text-green-deep hover:bg-green-bright/5',
                          )}
                        >
                          <Plus size={14} className="flex-shrink-0" />
                          <span className="font-semibold">{c.nombre}</span>
                          <span className="text-[10px] text-ink-mute font-mono">
                            mín. {c.edadMinimaGeneral}
                          </span>
                          {aAgregar && (
                            <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-green-bright/30 text-green-deep ml-1">
                              Se va a agregar
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Resumen de cambios pendientes */}
            {(() => {
              const aAgregar = seleccionadas.filter(
                (id) => !club.categoriaIds.includes(id),
              );
              const aQuitar = club.categoriaIds.filter(
                (id) => !seleccionadas.includes(id),
              );
              if (aAgregar.length === 0 && aQuitar.length === 0) return null;
              return (
                <div className="mt-4 px-3 py-2 rounded-card bg-accent/10 border border-accent/30 flex items-start gap-2 text-xs">
                  <AlertTriangle
                    size={14}
                    className="flex-shrink-0 mt-0.5 text-accent"
                  />
                  <div className="space-y-0.5 text-ink">
                    <div className="font-semibold">Cambios pendientes:</div>
                    {aAgregar.length > 0 && (
                      <div>
                        <span className="text-green-deep font-semibold">
                          {aAgregar.length} agregar
                        </span>{' '}
                        — heredan la directiva actual del club.
                      </div>
                    )}
                    {aQuitar.length > 0 && (
                      <div>
                        <span className="text-danger font-semibold">
                          {aQuitar.length} quitar
                        </span>{' '}
                        — se borra la directiva de esa categoría
                        (los jugadores deben estar eliminados primero).
                      </div>
                    )}
                    <div className="text-ink-mute italic mt-1">
                      Haz click en &ldquo;Guardar&rdquo; para aplicar.
                    </div>
                  </div>
                </div>
              );
            })()}

            {form.formState.errors.categoriaIds?.message && (
              <p className="text-xs text-danger mt-2">
                {form.formState.errors.categoriaIds.message}
              </p>
            )}
          </div>

          <div>
            <CardLabel>Colores</CardLabel>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-ink-mute mb-1">
                  Primario
                </label>
                <ColorSwatchPicker
                  value={form.watch('colorPrimario')}
                  onChange={(c) =>
                    form.setValue('colorPrimario', c, { shouldDirty: true })
                  }
                />
                {form.formState.errors.colorPrimario?.message && (
                  <p className="text-xs text-danger mt-1">
                    {form.formState.errors.colorPrimario.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-ink-mute mb-1">
                  Secundario (opcional)
                </label>
                <ColorSwatchPicker
                  value={form.watch('colorSecundario') ?? ''}
                  onChange={(c) =>
                    form.setValue('colorSecundario', c, { shouldDirty: true })
                  }
                  allowEmpty
                />
              </div>
            </div>
          </div>

          <div>
            <CardLabel>Reseña (opcional)</CardLabel>
            <textarea
              {...form.register('resena')}
              rows={4}
              className="input w-full mt-2"
              placeholder="Breve historia del club, año de fundación, hitos…"
            />
            {form.formState.errors.resena?.message && (
              <p className="text-xs text-danger mt-1">
                {form.formState.errors.resena.message}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-line">
            <Button type="submit" variant="accent" loading={mutation.isPending}>
              <Save size={14} /> Guardar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
