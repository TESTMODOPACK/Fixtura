'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreateEquipo } from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';

const EquipoFormSchema = z.object({
  nombre: z.string().min(2).max(150),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  colorPrimario: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Formato hex #RRGGBB'),
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
  onDone,
}: {
  torneoId: string;
  onDone: () => void;
}): React.ReactElement {
  const mutation = useCreateEquipo(torneoId);

  const form = useForm<EquipoForm>({
    resolver: zodResolver(EquipoFormSchema),
    defaultValues: { nombre: '', slug: '', colorPrimario: '#1B4332' },
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
    });
    onDone();
  };

  const error = mutation.error as ApiError | undefined;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end">
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
      <div>
        <label className="label">Color</label>
        <input
          type="color"
          className="h-10 w-14 rounded-card border border-line cursor-pointer"
          {...form.register('colorPrimario')}
        />
      </div>
      <div className="flex flex-col gap-1">
        {error && <span className="text-xs text-danger">{error.message}</span>}
        <Button type="submit" variant="accent" size="sm" loading={mutation.isPending}>
          <Save size={14} /> Inscribir
        </Button>
      </div>
    </form>
  );
}
