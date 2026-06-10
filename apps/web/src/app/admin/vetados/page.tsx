'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Gavel, Plus, ShieldOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { formatearRut, validarRut } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import {
  FormErrorBanner,
  makeRhfErrorHandler,
} from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import {
  useCreateVetado,
  useDeleteVetado,
  useVetados,
} from '@/hooks/use-admin';
import { toastSuccess } from '@/lib/toast';
import { formatFecha } from '@/lib/format';

const VetadoFormSchema = z.object({
  rut: z
    .string()
    .min(7, 'Mínimo 7 caracteres')
    .max(20)
    .refine(validarRut, 'RUT inválido (chequeá el dígito verificador)'),
  motivo: z.string().min(3, 'Indicá el motivo').max(1000),
});
type VetadoForm = z.infer<typeof VetadoFormSchema>;

export default function VetadosPage(): React.ReactElement {
  const { data: vetados, isLoading } = useVetados();
  const createVetado = useCreateVetado();
  const deleteVetado = useDeleteVetado();
  const [adding, setAdding] = useState(false);

  const form = useForm<VetadoForm>({
    resolver: zodResolver(VetadoFormSchema),
    defaultValues: { rut: '', motivo: '' },
    mode: 'onChange',
  });

  const onSubmit = async (vals: VetadoForm): Promise<void> => {
    try {
      await createVetado.mutateAsync({
        rut: vals.rut,
        motivo: vals.motivo,
      });
      toastSuccess(`RUT ${vals.rut} vetado correctamente.`);
      form.reset();
      setAdding(false);
    } catch {
      // toastError ya lo dispara MutationCache.onError globalmente.
    }
  };

  const onValidationError = makeRhfErrorHandler({ formName: 'vetar-jugador' });

  const onDelete = async (id: string, rut: string): Promise<void> => {
    const ok = confirm(
      `¿Levantar el veto del RUT ${rut}? Una vez eliminado, el RUT puede ` +
        'volver a ser fichado por cualquier club de la liga.',
    );
    if (!ok) return;
    await deleteVetado.mutateAsync(id);
  };

  const apiError = createVetado.error;

  return (
    <>
      <PageHead
        eyebrow="Comunidad"
        title="Jugadores vetados"
        sub="Lista negra a nivel liga. Un RUT vetado no puede ser fichado por ningún club. Las sanciones permanentes del Tribunal se agregan automáticamente; el admin también puede vetar manualmente."
      >
        {!adding && (
          <Button
            variant="accent"
            size="sm"
            onClick={() => setAdding(true)}
          >
            <Plus size={14} /> Vetar jugador
          </Button>
        )}
      </PageHead>

      {adding && (
        <Card padding="comfortable" className="mb-4">
          <CardLabel>Vetar jugador</CardLabel>
          <div className="mt-3">
            <FormErrorBanner apiError={apiError} apiTitle="No se pudo vetar el jugador" />
          </div>
          <form
            onSubmit={form.handleSubmit(onSubmit, onValidationError)}
            className="space-y-3 mt-3"
          >
            <Input
              label="RUT del jugador"
              placeholder="12.345.678-9"
              autoFocus
              {...form.register('rut')}
              onBlur={(e) => {
                const v = e.target.value;
                if (v && validarRut(v)) {
                  form.setValue('rut', formatearRut(v), {
                    shouldDirty: true,
                  });
                }
              }}
              error={form.formState.errors.rut?.message}
            />
            <div>
              <label className="label">Motivo del veto</label>
              <textarea
                className="input min-h-[80px]"
                placeholder="Ej. agresión a árbitro, falsificación de documentos, etc."
                {...form.register('motivo')}
              />
              {form.formState.errors.motivo && (
                <p className="text-xs text-danger mt-1">
                  {form.formState.errors.motivo.message}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                variant="accent"
                size="sm"
                loading={createVetado.isPending}
              >
                <ShieldOff size={14} /> Confirmar veto
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  form.reset();
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card padding="none" className="overflow-hidden">
        {isLoading && (
          <div className="p-6 font-serif italic text-ink-mute">Cargando…</div>
        )}

        {!isLoading && (vetados?.length ?? 0) === 0 && !adding && (
          <div className="p-12 text-center">
            <ShieldOff size={36} className="mx-auto text-line mb-3" />
            <div className="font-display text-2xl text-green-deep tracking-display mb-2">
              SIN VETADOS
            </div>
            <p className="font-serif italic text-ink-mute">
              No hay jugadores vetados en esta liga.
            </p>
          </div>
        )}

        {vetados && vetados.length > 0 && (
          <div className="divide-y divide-line">
            {vetados.map((v) => (
              <div
                key={v.id}
                className="px-5 py-3 grid grid-cols-[auto_1fr_auto_auto] gap-3 items-start"
              >
                <div className="w-8 h-8 rounded-full bg-danger/15 text-danger flex items-center justify-center">
                  <ShieldOff size={14} />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-ink truncate">
                    {v.jugadorNombre ?? 'Jugador no identificado'}
                  </div>
                  <div className="text-xs text-ink-mute mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="font-mono">{v.rut}</span>
                    {v.clubNombre && <span>· {v.clubNombre}</span>}
                  </div>
                  {v.motivo && (
                    <div className="text-xs text-ink-mute mt-0.5">
                      {v.motivo}
                    </div>
                  )}
                  <div className="text-xs text-ink-mute mt-1 flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      {v.origen === 'TRIBUNAL' ? (
                        <>
                          <Gavel size={11} /> Origen: Tribunal
                        </>
                      ) : (
                        <>
                          <ShieldOff size={11} /> Origen: Manual
                        </>
                      )}
                    </span>
                    {v.creadoPorNombre && (
                      <span>· por {v.creadoPorNombre}</span>
                    )}
                    <span>
                      ·{' '}
                      {formatFecha(v.createdAt)}
                    </span>
                  </div>
                </div>
                <span className="text-[9px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-danger/15 text-danger">
                  Vetado
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(v.id, v.rut)}
                  className="h-8 w-8 flex items-center justify-center rounded-card hover:bg-danger/10 text-danger"
                  aria-label="Levantar veto"
                  title="Levantar veto"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
