'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Club } from '@fixtura/types';
import { Save, X } from 'lucide-react';
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
import { useUpdateClub } from '@/hooks/use-admin';
import { toastError, toastSuccess } from '@/lib/toast';

/**
 * Sprint 32 — drawer para editar los datos transversales del club
 * (nombre, escudo, colores, página web, reseña). Estos campos son
 * compartidos por todas las categorías del club, así que se editan
 * acá y no desde la ficha por categoría.
 *
 * NO incluye la directiva del club (eso se edita por categoría).
 * NO incluye el set de categorías asignadas (eso es decisión más
 * grande y se hace desde otro lado si hace falta — por ahora solo
 * desde "Nuevo club" o admin DB).
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
  z.url('URL inválida — usá formato https://dominio.com').max(500).optional(),
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
});
type FormData = z.infer<typeof FormSchema>;

const FIELD_LABEL: Record<string, string> = {
  nombre: 'Nombre',
  escudoUrl: 'Escudo',
  colorPrimario: 'Color primario',
  colorSecundario: 'Color secundario',
  paginaWeb: 'Página web',
  resena: 'Reseña',
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

  const form = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      nombre: club.nombre,
      escudoUrl: club.escudoUrl ?? '',
      colorPrimario: club.colorPrimario ?? '#1B4332',
      colorSecundario: club.colorSecundario ?? '',
      paginaWeb: club.paginaWeb ?? '',
      resena: club.resena ?? '',
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
      });
    }
  }, [open, club.id, club.nombre, club.escudoUrl, club.colorPrimario, club.colorSecundario, club.paginaWeb, club.resena, form]);

  // ESC cierra el drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const onSubmit = async (vals: FormData): Promise<void> => {
    try {
      await mutation.mutateAsync({
        nombre: vals.nombre.trim(),
        escudoUrl: vals.escudoUrl?.trim() || null,
        colorPrimario: vals.colorPrimario,
        colorSecundario: vals.colorSecundario?.trim() || null,
        paginaWeb: vals.paginaWeb?.trim() || null,
        resena: vals.resena?.trim() || null,
      });
      toastSuccess('Datos del club actualizados.');
      onClose();
    } catch (err) {
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
