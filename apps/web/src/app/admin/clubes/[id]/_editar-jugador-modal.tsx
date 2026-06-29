'use client';

import type { Jugador } from '@fixtura/types';
import { zodResolver } from '@/lib/zod-resolver';
import { ChevronDown, Phone, Save, ShieldAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  FormErrorBanner,
  makeRhfErrorHandler,
} from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import { useUpdateJugadorClub } from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { toastSuccess } from '@/lib/toast';

/**
 * Sprint 33B — modal para editar un jugador individual del plantel.
 *
 * NO permite cambiar RUT ni categoría — son cambios estructurales que
 * requieren eliminar y volver a crear el jugador.
 *
 * Sección "Contacto de emergencia": campos opcionales para avisar a
 * un familiar/responsable si el jugador se accidenta durante un
 * partido. La sección se muestra expandida si el jugador ya tiene
 * datos cargados, colapsada si no, para mantener el form simple en
 * el caso común.
 */

const EditarJugadorSchema = z.object({
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
  email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.email('Email inválido — usa formato nombre@dominio.com').max(150).optional(),
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
  estado: z.enum(['ACTIVO', 'INACTIVO']),
  // Contacto de emergencia (sprint 33A).
  telefonoContacto: z.string().max(50).optional(),
  nombreContacto: z.string().max(100).optional(),
});
type EditarJugadorForm = z.infer<typeof EditarJugadorSchema>;

export function EditarJugadorModal({
  clubId,
  jugador,
  open,
  onClose,
}: {
  clubId: string;
  jugador: Jugador | null;
  open: boolean;
  onClose: () => void;
}): React.ReactElement | null {
  const updateJugador = useUpdateJugadorClub(clubId);
  const tieneContacto = Boolean(
    jugador?.telefonoContacto || jugador?.nombreContacto,
  );
  const [emergenciaAbierta, setEmergenciaAbierta] = useState(tieneContacto);

  const form = useForm<EditarJugadorForm>({
    resolver: zodResolver(EditarJugadorSchema),
    defaultValues: {
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
      estado: 'ACTIVO',
      telefonoContacto: '',
      nombreContacto: '',
    },
    mode: 'onChange',
  });

  // Cargar valores del jugador cuando cambia (o al abrir el modal).
  useEffect(() => {
    if (!jugador) return;
    form.reset({
      nombres: jugador.nombres,
      apellidos: jugador.apellidos,
      fechaNac: jugador.fechaNac ?? '',
      email: jugador.email ?? '',
      telefono: jugador.telefono ?? '',
      numeroCamiseta:
        jugador.numeroCamiseta == null
          ? ('' as unknown as number)
          : jugador.numeroCamiseta,
      posicion: jugador.posicion ?? undefined,
      pieHabil: jugador.pieHabil ?? undefined,
      apodo: jugador.apodo ?? '',
      capitan: jugador.capitan,
      estado: jugador.estado,
      telefonoContacto: jugador.telefonoContacto ?? '',
      nombreContacto: jugador.nombreContacto ?? '',
    });
    setEmergenciaAbierta(
      Boolean(jugador.telefonoContacto || jugador.nombreContacto),
    );
  }, [jugador, form]);

  if (!open || !jugador) return null;

  const onSubmit = async (vals: EditarJugadorForm): Promise<void> => {
    const numeroCamiseta =
      typeof vals.numeroCamiseta === 'number' &&
      Number.isFinite(vals.numeroCamiseta)
        ? vals.numeroCamiseta
        : null;

    await updateJugador.mutateAsync({
      jugadorId: jugador.id,
      input: {
        nombres: vals.nombres,
        apellidos: vals.apellidos,
        fechaNac: vals.fechaNac || null,
        email: vals.email || null,
        telefono: vals.telefono || null,
        numeroCamiseta,
        posicion: vals.posicion ?? null,
        pieHabil: vals.pieHabil ?? null,
        apodo: vals.apodo || null,
        telefonoContacto: vals.telefonoContacto || null,
        nombreContacto: vals.nombreContacto || null,
        capitan: vals.capitan,
        estado: vals.estado,
      },
    });
    toastSuccess(
      `${vals.nombres} ${vals.apellidos} actualizado.`,
    );
    onClose();
  };

  const error = updateJugador.error as ApiError | undefined;

  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center px-4 overflow-y-auto py-8">
      <div className="bg-chalk rounded-card border border-line max-w-2xl w-full">
        {/* Header */}
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-mute font-semibold">
              Editar jugador
            </div>
            <div className="font-display text-xl text-green-deep tracking-display">
              {jugador.nombres.toUpperCase()} {jugador.apellidos.toUpperCase()}
            </div>
            <div className="text-xs font-mono text-ink-mute mt-0.5">
              RUT {jugador.rut} · no editable
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-mute hover:text-ink p-1"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={form.handleSubmit(
            onSubmit,
            makeRhfErrorHandler({ formName: 'editar-jugador-club' }),
          )}
          className="p-5 space-y-4"
        >
          {/* Datos generales */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            <Input
              label="Fecha de nacimiento"
              type="date"
              {...form.register('fechaNac')}
              error={form.formState.errors.fechaNac?.message}
            />
            <Input
              label="N° camiseta (opcional)"
              type="number"
              min={0}
              max={99}
              placeholder="10"
              {...form.register('numeroCamiseta')}
            />
            <Input
              label="Email"
              type="email"
              placeholder="jugador@correo.cl"
              {...form.register('email')}
              error={form.formState.errors.email?.message}
            />
            <Input
              label="Teléfono"
              placeholder="+56 9 1234 5678"
              {...form.register('telefono')}
            />
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
            <Input label="Apodo" {...form.register('apodo')} />
            <div>
              <label className="label">Estado</label>
              <select className="input" {...form.register('estado')}>
                <option value="ACTIVO">Activo</option>
                <option value="INACTIVO">Inactivo</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register('capitan')} />
            Es capitán del equipo
          </label>

          {/* Contacto de emergencia (sección plegable) */}
          <div className="border border-line/70 rounded-card bg-paper/40">
            <button
              type="button"
              onClick={() => setEmergenciaAbierta((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-paper/60 rounded-card"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert size={14} className="text-accent" />
                <div>
                  <div className="text-sm font-semibold text-ink">
                    Contacto de emergencia
                  </div>
                  <div className="text-[11px] text-ink-mute font-serif italic">
                    Opcional — para avisar a un familiar si el jugador se
                    accidenta durante un partido.
                  </div>
                </div>
              </div>
              <ChevronDown
                size={16}
                className={`text-ink-mute transition-transform ${
                  emergenciaAbierta ? 'rotate-180' : ''
                }`}
              />
            </button>
            {emergenciaAbierta && (
              <div className="px-4 pb-4 pt-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  label="Nombre del contacto"
                  placeholder="Ej: María González (esposa)"
                  {...form.register('nombreContacto')}
                />
                <Input
                  label="Teléfono del contacto"
                  placeholder="+56 9 9876 5432"
                  {...form.register('telefonoContacto')}
                />
              </div>
            )}
          </div>

          {error && (
            <FormErrorBanner
              apiError={error}
              apiTitle="No se pudo guardar"
            />
          )}

          {/* Acciones */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="accent"
              size="sm"
              loading={updateJugador.isPending}
            >
              <Save size={14} /> Guardar cambios
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Componente auxiliar para el botón ✏ por fila en el plantel.
 */
export function JugadorContactoEmergenciaBadge({
  jugador,
}: {
  jugador: Jugador;
}): React.ReactElement | null {
  if (!jugador.telefonoContacto && !jugador.nombreContacto) return null;
  return (
    <span
      className="inline-flex items-center text-[10px] text-accent"
      title={`Contacto de emergencia: ${
        jugador.nombreContacto ?? '—'
      }${jugador.telefonoContacto ? ` · ${jugador.telefonoContacto}` : ''}`}
    >
      <Phone size={10} />
    </span>
  );
}
