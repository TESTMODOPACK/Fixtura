'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Save } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { formatearRut, validarRut } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import {
  FormErrorBanner,
  makeRhfErrorHandler,
} from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import { useAddJugadorClub } from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { toastSuccess } from '@/lib/toast';

/**
 * Sprint 26C — Form de alta de jugador al plantel del club.
 *
 * Campos requeridos por ADR-0004:
 *   RUT, nombres, apellidos, fechaNac, email (opcional), teléfono.
 *   Edad y edadCalendario se calculan al vuelo en el backend.
 *
 * Maneja el caso "jugador entra en excepción de edad":
 *   El backend devuelve 409 con mensaje específico. El UI captura ese
 *   error y muestra un modal de confirmación. Si el admin acepta, el
 *   form re-envía con aceptarExcepcionEdad=true.
 */

const JugadorFormSchema = z.object({
  rut: z
    .string()
    .min(7, 'Mínimo 7 caracteres')
    .max(20)
    .refine(validarRut, 'RUT inválido (chequeá el dígito verificador)'),
  nombres: z.string().min(2).max(100),
  apellidos: z.string().min(2).max(100),
  fechaNac: z
    .string()
    .optional()
    .refine((v) => {
      if (!v) return true;
      const d = new Date(`${v}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) return false;
      if (d.getTime() > Date.now()) return false;
      if (d.getUTCFullYear() < 1900) return false;
      return true;
    }, 'Fecha inválida (debe ser pasada y posterior a 1900).'),
  // Email opcional: si hay texto, debe ser email válido. preprocess
  // convierte "" a undefined antes de validar.
  email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.email('Email inválido — usá formato nombre@dominio.com').max(150).optional(),
  ),
  telefono: z.string().max(50).optional(),
  numeroCamiseta: z
    .union([z.coerce.number().int().min(0).max(99), z.literal('')])
    .optional(),
  posicion: z
    .enum(['ARQUERO', 'DEFENSA', 'MEDIO', 'DELANTERO'])
    .optional()
    .or(z.literal('').transform(() => undefined)),
  pieHabil: z
    .enum(['IZQUIERDO', 'DERECHO', 'AMBIDIESTRO'])
    .optional()
    .or(z.literal('').transform(() => undefined)),
  apodo: z.string().max(50).optional(),
  capitan: z.boolean().default(false),
});
type JugadorForm = z.infer<typeof JugadorFormSchema>;

export function NuevoJugadorForm({
  clubId,
  categoriaId,
  onDone,
}: {
  clubId: string;
  categoriaId: string;
  onDone: () => void;
}): React.ReactElement {
  const addJugador = useAddJugadorClub(clubId);
  const [excepcionPendiente, setExcepcionPendiente] = useState<{
    mensaje: string;
    payload: JugadorForm;
  } | null>(null);

  const form = useForm<JugadorForm>({
    resolver: zodResolver(JugadorFormSchema),
    defaultValues: {
      rut: '',
      nombres: '',
      apellidos: '',
      fechaNac: '',
      email: '',
      telefono: '',
      numeroCamiseta: '' as unknown as number,
      posicion: undefined,
      pieHabil: undefined,
      apodo: '',
      capitan: false,
    },
    mode: 'onChange',
  });

  const sendToBackend = async (
    vals: JugadorForm,
    aceptarExcepcionEdad: boolean,
  ): Promise<void> => {
    const numeroCamiseta =
      typeof vals.numeroCamiseta === 'number' &&
      Number.isFinite(vals.numeroCamiseta)
        ? vals.numeroCamiseta
        : null;
    try {
      await addJugador.mutateAsync({
        categoriaId,
        rut: vals.rut,
        nombres: vals.nombres,
        apellidos: vals.apellidos,
        fechaNac: vals.fechaNac || null,
        email: vals.email || null,
        telefono: vals.telefono || null,
        numeroCamiseta,
        posicion: vals.posicion ?? null,
        pieHabil: vals.pieHabil ?? null,
        apodo: vals.apodo || null,
        capitan: vals.capitan,
        aceptarExcepcionEdad,
      });
      toastSuccess(
        `Jugador ${vals.nombres} ${vals.apellidos} agregado al plantel.`,
      );
      onDone();
    } catch (err) {
      // Backend usa 409 ConflictException para excepción de edad —
      // lo capturamos para mostrar el modal en vez del banner rojo.
      const apiErr = err as ApiError;
      if (
        apiErr.statusCode === 409 &&
        apiErr.message?.includes('EXCEPCIÓN de')
      ) {
        setExcepcionPendiente({ mensaje: apiErr.message, payload: vals });
      }
      // El resto de los errores (RUT vetado, RUT duplicado, bloqueado
      // por edad insuficiente) los muestra el banner abajo del form
      // vía mutation.error.
    }
  };

  const onSubmit = (vals: JugadorForm): Promise<void> =>
    sendToBackend(vals, false);

  const confirmarExcepcion = (): Promise<void> => {
    if (!excepcionPendiente) return Promise.resolve();
    const payload = excepcionPendiente.payload;
    setExcepcionPendiente(null);
    return sendToBackend(payload, true);
  };

  const error = addJugador.error as ApiError | undefined;
  // Si el error fue de excepción, ya lo manejamos con modal — no lo
  // mostramos abajo.
  const errorVisible =
    error &&
    !(error.statusCode === 409 && error.message?.includes('EXCEPCIÓN de'));

  return (
    <>
      <form
        onSubmit={form.handleSubmit(
          onSubmit,
          makeRhfErrorHandler({ formName: 'nuevo-jugador-club' }),
        )}
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
      >
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            label="RUT"
            placeholder="12.345.678-9"
            {...form.register('rut')}
            onBlur={(e) => {
              const v = e.target.value;
              if (v && validarRut(v)) {
                form.setValue('rut', formatearRut(v), { shouldDirty: true });
              }
            }}
            error={form.formState.errors.rut?.message}
          />
          <Input
            label="Nombres"
            {...form.register('nombres')}
            error={form.formState.errors.nombres?.message}
          />
          <Input
            label="Apellidos"
            {...form.register('apellidos')}
            error={form.formState.errors.apellidos?.message}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Fecha de nacimiento"
            type="date"
            {...form.register('fechaNac')}
            error={form.formState.errors.fechaNac?.message}
          />
          <Input
            label="N° camiseta"
            type="number"
            min={0}
            max={99}
            placeholder="10"
            {...form.register('numeroCamiseta')}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Email (opcional)"
            type="email"
            {...form.register('email')}
            error={form.formState.errors.email?.message}
          />
          <Input
            label="Teléfono (opcional)"
            {...form.register('telefono')}
          />
        </div>

        <div>
          <label className="label">Posición</label>
          <select className="input" {...form.register('posicion')}>
            <option value="">— Sin especificar —</option>
            <option value="ARQUERO">Arquero</option>
            <option value="DEFENSA">Defensa</option>
            <option value="MEDIO">Mediocampo</option>
            <option value="DELANTERO">Delantero</option>
          </select>
        </div>

        <div>
          <label className="label">Pie hábil</label>
          <select className="input" {...form.register('pieHabil')}>
            <option value="">— Sin especificar —</option>
            <option value="IZQUIERDO">Izquierdo</option>
            <option value="DERECHO">Derecho</option>
            <option value="AMBIDIESTRO">Ambidiestro</option>
          </select>
        </div>

        <Input label="Apodo (opcional)" {...form.register('apodo')} />

        <label className="flex items-center gap-2 text-sm pt-7">
          <input type="checkbox" {...form.register('capitan')} />
          Capitán del equipo
        </label>

        {errorVisible && (
          <div className="md:col-span-2">
            <FormErrorBanner
              apiError={error}
              apiTitle="No se pudo agregar el jugador"
            />
          </div>
        )}

        <div className="md:col-span-2 flex items-center gap-3">
          <Button
            type="submit"
            variant="accent"
            size="sm"
            loading={addJugador.isPending}
          >
            <Save size={14} /> Agregar al plantel
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDone}
          >
            Cancelar
          </Button>
        </div>
      </form>

      {/* Modal de confirmación cuando el jugador entra en excepción de edad */}
      {excepcionPendiente && (
        <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center px-4">
          <div className="bg-chalk rounded-card border border-line max-w-md w-full p-5">
            <div className="flex items-start gap-3 mb-3">
              <AlertTriangle
                size={24}
                className="text-accent flex-shrink-0 mt-0.5"
              />
              <div>
                <div className="font-display text-lg text-green-deep tracking-display">
                  CONFIRMAR EXCEPCIÓN DE EDAD
                </div>
                <p className="text-sm text-ink-mute mt-2">
                  {excepcionPendiente.mensaje}
                </p>
                <p className="text-xs font-serif italic text-ink-mute mt-2">
                  Si confirmás, el jugador queda inscripto y cuenta dentro del
                  cupo de excepciones que tiene la categoría.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setExcepcionPendiente(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={confirmarExcepcion}
                loading={addJugador.isPending}
              >
                Sí, confirmar excepción
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
