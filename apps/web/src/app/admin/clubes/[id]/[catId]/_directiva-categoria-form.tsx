'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ContactoDirectiva } from '@fixtura/types';
import { ContactoDirectivaSchema } from '@fixtura/types';
import { CheckCircle2, Clock, Plus, Save, Send, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  FormErrorBanner,
  makeRhfErrorHandler,
  rhfErrorsToBanner,
} from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import { useUpdateDirectivaCategoria } from '@/hooks/use-admin';
import { useDelegadoCuenta, useInvitarDelegado } from '@/hooks/use-delegado';
import { toastError, toastSuccess } from '@/lib/toast';

/**
 * Sprint 32 — form para editar la directiva (presidente + delegados)
 * específica de un (club, categoría). NO toca la directiva "madre" del
 * club ni la de otras categorías.
 */

const FormSchema = z.object({
  presidenteNombre: z.string().trim().optional(),
  presidenteEmail: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.email('Email inválido').optional(),
    )
    .optional(),
  presidenteTelefono: z.string().trim().max(50).optional(),
  delegados: z.array(ContactoDirectivaSchema).max(20, 'Máximo 20 delegados'),
});
type FormData = z.infer<typeof FormSchema>;

const FIELD_LABEL: Record<string, string> = {
  presidenteNombre: 'Presidente · nombre',
  presidenteEmail: 'Presidente · email',
  presidenteTelefono: 'Presidente · teléfono',
  delegados: 'Delegados',
};

export function DirectivaCategoriaForm({
  clubId,
  categoriaId,
  categoriaNombre,
  initialPresidente,
  initialDelegados,
}: {
  clubId: string;
  categoriaId: string;
  categoriaNombre: string;
  initialPresidente: ContactoDirectiva | null;
  initialDelegados: ContactoDirectiva[];
}): React.ReactElement {
  const mutation = useUpdateDirectivaCategoria(clubId, categoriaId);
  // F55 — acceso al sistema (delegado). Es de alcance CLUB (ve todas las
  // categorías), así que la cuenta es una sola por club aunque la directiva
  // sea por categoría.
  const { data: cuentaDelegado } = useDelegadoCuenta(clubId);
  const invitar = useInvitarDelegado(clubId);

  const form = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      presidenteNombre: initialPresidente?.nombre ?? '',
      presidenteEmail: initialPresidente?.email ?? '',
      presidenteTelefono: initialPresidente?.telefono ?? '',
      delegados: initialDelegados ?? [],
    },
    mode: 'onChange',
  });

  // Reset cuando cambia la categoría (navegación entre tabs).
  useEffect(() => {
    form.reset({
      presidenteNombre: initialPresidente?.nombre ?? '',
      presidenteEmail: initialPresidente?.email ?? '',
      presidenteTelefono: initialPresidente?.telefono ?? '',
      delegados: initialDelegados ?? [],
    });
  }, [
    categoriaId,
    initialPresidente?.nombre,
    initialPresidente?.email,
    initialPresidente?.telefono,
    initialDelegados,
    form,
  ]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'delegados',
  });

  const onSubmit = async (vals: FormData): Promise<void> => {
    try {
      const presNombre = vals.presidenteNombre?.trim();
      const presidente: ContactoDirectiva | null = presNombre
        ? {
            nombre: presNombre,
            email: vals.presidenteEmail?.trim() || null,
            telefono: vals.presidenteTelefono?.trim() || null,
          }
        : null;
      const delegados: ContactoDirectiva[] = vals.delegados
        .filter((d) => d.nombre.trim().length > 0)
        .map((d) => ({
          nombre: d.nombre.trim(),
          email: d.email?.trim() || null,
          telefono: d.telefono?.trim() || null,
        }));
      await mutation.mutateAsync({ presidente, delegados });
      toastSuccess(`Directiva de ${categoriaNombre} actualizada.`);
    } catch (err) {
      toastError(err);
    }
  };

  const apiError = mutation.error;
  const fieldErrors = rhfErrorsToBanner(
    form.formState.errors as Record<string, unknown>,
    FIELD_LABEL,
  );

  return (
    <form
      onSubmit={form.handleSubmit(
        onSubmit,
        makeRhfErrorHandler({ formName: 'directiva-categoria' }),
      )}
      className="space-y-4"
    >
      <FormErrorBanner
        fieldErrors={fieldErrors}
        apiError={apiError}
        apiTitle="No se pudo guardar la directiva"
      />

      {/* Presidente */}
      <div>
        <div className="text-xs uppercase tracking-wider font-semibold text-ink-mute mb-2">
          Presidente de {categoriaNombre}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            label="Nombre"
            placeholder="Apellido Nombre"
            {...form.register('presidenteNombre')}
            error={form.formState.errors.presidenteNombre?.message}
          />
          <Input
            label="Email"
            type="email"
            placeholder="contacto@club.cl"
            {...form.register('presidenteEmail')}
            error={form.formState.errors.presidenteEmail?.message}
          />
          <Input
            label="Teléfono"
            placeholder="+56 9 1234 5678"
            {...form.register('presidenteTelefono')}
            error={form.formState.errors.presidenteTelefono?.message}
          />
        </div>
      </div>

      {/* Delegados */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs uppercase tracking-wider font-semibold text-ink-mute">
            Delegados de {categoriaNombre}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              append({ nombre: '', email: null, telefono: null })
            }
          >
            <Plus size={12} /> Agregar delegado
          </Button>
        </div>
        <p className="text-[11px] text-ink-mute mb-2 leading-snug">
          Desde acá podés darle a un delegado <strong>acceso al sistema</strong>:
          verá plantel, resultados, sanciones y deudas de <strong>todo el club</strong>
          {' '}y podrá pagar en línea. Necesita un email. El enlace de activación vence en 72 h.
        </p>
        {fields.length === 0 && (
          <p className="text-xs font-serif italic text-ink-mute">
            Sin delegados cargados.
          </p>
        )}
        {fields.length > 0 && (
          <div className="space-y-3">
            {fields.map((field, idx) => {
              const emailRow = (form.watch(`delegados.${idx}.email`) ?? '').trim();
              const nombreRow = (form.watch(`delegados.${idx}.nombre`) ?? '').trim();
              const esCuenta =
                !!cuentaDelegado?.email &&
                !!emailRow &&
                cuentaDelegado.email.toLowerCase() === emailRow.toLowerCase();
              const invitandoEste =
                invitar.isPending &&
                invitar.variables?.email?.toLowerCase() === emailRow.toLowerCase();
              return (
                <div key={field.id} className="rounded-card border border-line/60 p-3 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                    <Input
                      label={idx === 0 ? 'Nombre' : undefined}
                      placeholder="Apellido Nombre"
                      {...form.register(`delegados.${idx}.nombre`)}
                      error={form.formState.errors.delegados?.[idx]?.nombre?.message}
                    />
                    <Input
                      label={idx === 0 ? 'Email' : undefined}
                      type="email"
                      placeholder="email@club.cl"
                      {...form.register(`delegados.${idx}.email`)}
                      error={form.formState.errors.delegados?.[idx]?.email?.message}
                    />
                    <Input
                      label={idx === 0 ? 'Teléfono' : undefined}
                      placeholder="+56 9 1234 5678"
                      {...form.register(`delegados.${idx}.telefono`)}
                    />
                    <button
                      type="button"
                      onClick={() => remove(idx)}
                      className="h-9 w-9 flex items-center justify-center rounded-card hover:bg-danger/10 text-danger"
                      aria-label="Eliminar delegado"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Acceso al sistema para este delegado */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {esCuenta && cuentaDelegado?.estado === 'ACTIVA' && (
                      <span className="text-[11px] font-semibold px-2 py-1 rounded bg-green-bright/15 text-green-bright flex items-center gap-1">
                        <CheckCircle2 size={12} /> Tiene acceso al sistema
                      </span>
                    )}
                    {esCuenta && cuentaDelegado?.estado === 'PENDIENTE' && (
                      <span className="text-[11px] font-semibold px-2 py-1 rounded bg-orange-700/15 text-orange-700 flex items-center gap-1">
                        <Clock size={12} /> Invitación enviada — pendiente de activar
                      </span>
                    )}
                    {!esCuenta && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!emailRow || invitar.isPending}
                        loading={invitandoEste}
                        onClick={() =>
                          invitar.mutate(
                            { nombre: nombreRow || emailRow, email: emailRow, canal: 'EMAIL' },
                            {
                              onSuccess: (r) => toastSuccess(r.mensaje),
                              onError: (e) => toastError(e),
                            },
                          )
                        }
                      >
                        <Send size={12} /> Dar acceso al sistema
                      </Button>
                    )}
                    {!emailRow && (
                      <span className="text-[11px] text-ink-mute italic">
                        Agregá un email para poder darle acceso.
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" variant="accent" size="sm" loading={mutation.isPending}>
          <Save size={14} /> Guardar directiva
        </Button>
      </div>
    </form>
  );
}
