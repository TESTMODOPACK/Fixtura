'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { ColorSwatchPicker } from '@/components/ui/color-swatch-picker';
import { Input } from '@/components/ui/input';
import { useCreateEquipo } from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';

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
  const tieneSeries = (series?.length ?? 0) > 0;

  const form = useForm<EquipoForm>({
    resolver: zodResolver(EquipoFormSchema),
    defaultValues: { nombre: '', slug: '', colorPrimario: '#1B4332', serieSlug: '' },
  });

  const nombre = form.watch('nombre');
  useEffect(() => {
    form.setValue('slug', slugify(nombre));
  }, [nombre, form]);

  const onSubmit = async (vals: EquipoForm): Promise<void> => {
    await mutation.mutateAsync({
      nombre: vals.nombre,
      slug: vals.slug,
      colorPrimario: vals.colorPrimario,
      // Si no hay categoría/series, NO mandamos serieSlug. El backend
      // ignora el campo cuando el torneo no tiene categoría, pero
      // somos defensivos en el cliente también.
      serieSlug: tieneSeries && vals.serieSlug ? vals.serieSlug : null,
    });
    onDone();
  };

  const error = mutation.error as ApiError | undefined;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
      {/* Fila 1: datos principales */}
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

      {/* Fila 2: color del equipo */}
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

      {/* Fila 3: error + botón */}
      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" variant="accent" size="sm" loading={mutation.isPending}>
          <Save size={14} /> Inscribir
        </Button>
        {error && <span className="text-xs text-danger">{error.message}</span>}
      </div>
    </form>
  );
}
