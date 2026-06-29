'use client';

import { zodResolver } from '@/lib/zod-resolver';
import type { ContactoDirectiva } from '@fixtura/types';
import {
  CheckCircle2,
  Clock,
  Mail,
  Pencil,
  Phone,
  Plus,
  Send,
  Trash2,
  User,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
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
 * Sprint 32 (rediseño) — directiva (presidente + delegados) por
 * (club, categoría). La directiva cargada se muestra como LISTADO de
 * lectura; cada registro tiene acciones (editar / dar acceso / eliminar)
 * y los inputs solo aparecen al agregar o editar un miembro.
 *
 * El acceso al sistema (cuenta de delegado) es de alcance CLUB: ve todas
 * las categorías, así que la cuenta es una sola por club aunque la
 * directiva sea por categoría.
 */

// Acepta dígitos, espacios, +, (), - (formato CL o internacional).
const TEL_REGEX = /^\+?[\d\s()-]{6,20}$/;

// Cargos típicos de una directiva. El select ofrece estos + "Otro" (texto libre).
const CARGOS = [
  'Presidente',
  'Vicepresidente',
  'Secretario',
  'Tesorero',
  'Director',
  'Delegado',
] as const;

const MiembroSchema = z.object({
  nombre: z.string().trim().min(2, 'Ingresa el nombre').max(150),
  cargo: z.string().trim().max(60).optional(),
  email: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.email('Email inválido').optional(),
    )
    .optional(),
  telefono: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z
        .string()
        .regex(TEL_REGEX, 'Teléfono inválido (ej. +56 9 1234 5678)')
        .max(50)
        .optional(),
    )
    .optional(),
});
type MiembroFormData = z.infer<typeof MiembroSchema>;

type Editando =
  | { tipo: 'presidente' }
  | { tipo: 'delegado'; index: number }
  | { tipo: 'nuevo' }
  | null;

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
  const { data: cuentaDelegado } = useDelegadoCuenta(clubId);
  const invitar = useInvitarDelegado(clubId);

  const [presidente, setPresidente] = useState<ContactoDirectiva | null>(initialPresidente);
  const [delegados, setDelegados] = useState<ContactoDirectiva[]>(initialDelegados ?? []);
  const [editando, setEditando] = useState<Editando>(null);

  // Reset solo al cambiar de categoría (navegación entre tabs). NO dependemos
  // de initialPresidente/initialDelegados: sus referencias cambian en cada
  // refetch del club (p.ej. al volver el foco) y reiniciarían un form abierto
  // a mitad de edición. Tras guardar, sincronizamos el estado a mano.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setPresidente(initialPresidente);
    setDelegados(initialDelegados ?? []);
    setEditando(null);
  }, [categoriaId]);

  const persistir = async (
    pres: ContactoDirectiva | null,
    dels: ContactoDirectiva[],
  ): Promise<void> => {
    try {
      await mutation.mutateAsync({ presidente: pres, delegados: dels });
      setPresidente(pres);
      setDelegados(dels);
      setEditando(null);
      toastSuccess(`Directiva de ${categoriaNombre} actualizada.`);
    } catch (err) {
      toastError(err);
    }
  };

  const eliminarDelegado = (index: number): void => {
    const d = delegados[index];
    if (!window.confirm(`¿Quitar a ${d?.nombre ?? 'este delegado'} de la directiva?`)) {
      return;
    }
    void persistir(presidente, delegados.filter((_, i) => i !== index));
  };

  const quitarPresidente = (): void => {
    if (!window.confirm('¿Quitar al presidente de esta categoría?')) return;
    void persistir(null, delegados);
  };

  // Acceso al sistema — badge (si ya tiene cuenta) o botón para invitar.
  const renderAcceso = (c: ContactoDirectiva): React.ReactNode => {
    const e = (c.email ?? '').trim();
    const n = (c.nombre ?? '').trim();
    if (!e) {
      return (
        <span className="text-[11px] text-ink-mute italic">
          Agrega un email para darle acceso al sistema.
        </span>
      );
    }
    const esCuenta =
      !!cuentaDelegado?.email && cuentaDelegado.email.toLowerCase() === e.toLowerCase();
    if (esCuenta && cuentaDelegado?.estado === 'ACTIVA') {
      return (
        <span className="text-[11px] font-semibold px-2 py-1 rounded bg-green-bright/15 text-green-bright inline-flex items-center gap-1">
          <CheckCircle2 size={12} /> Tiene acceso al sistema
        </span>
      );
    }
    if (esCuenta && cuentaDelegado?.estado === 'PENDIENTE') {
      return (
        <span className="text-[11px] font-semibold px-2 py-1 rounded bg-orange-700/15 text-orange-700 inline-flex items-center gap-1">
          <Clock size={12} /> Invitación enviada — pendiente de activar
        </span>
      );
    }
    const invitandoEste =
      invitar.isPending && invitar.variables?.email?.toLowerCase() === e.toLowerCase();
    return (
      <Button
        type="button"
        variant="default"
        size="sm"
        className="border-accent/50 text-accent hover:bg-accent/10"
        disabled={invitar.isPending}
        loading={invitandoEste}
        onClick={() =>
          invitar.mutate(
            { nombre: n || e, email: e, canal: 'EMAIL' },
            {
              onSuccess: (r) => toastSuccess(r.mensaje),
              onError: (err) => toastError(err),
            },
          )
        }
      >
        <Send size={12} /> Dar acceso al sistema
      </Button>
    );
  };

  const filaMiembro = (
    c: ContactoDirectiva,
    cargoFijo: string | null,
    acciones: { onEditar: () => void; onEliminar?: () => void },
  ): React.ReactElement => (
    <div className="flex items-start justify-between gap-3 rounded-card border border-line/60 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <User size={14} className="text-ink-mute flex-shrink-0" />
          <span className="font-semibold">{c.nombre}</span>
          {(cargoFijo ?? c.cargo) && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-paper-dark text-ink-mute uppercase tracking-wider">
              {cargoFijo ?? c.cargo}
            </span>
          )}
        </div>
        {(c.email || c.telefono) && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-mute mt-1 pl-6">
            {c.email && (
              <span className="flex items-center gap-1">
                <Mail size={10} /> {c.email}
              </span>
            )}
            {c.telefono && (
              <span className="flex items-center gap-1">
                <Phone size={10} /> {c.telefono}
              </span>
            )}
          </div>
        )}
        <div className="pl-6 mt-2">{renderAcceso(c)}</div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={acciones.onEditar}
          className="h-8 w-8 flex items-center justify-center rounded-card hover:bg-paper-dark text-ink-mute"
          title="Editar"
          aria-label="Editar"
        >
          <Pencil size={14} />
        </button>
        {acciones.onEliminar && (
          <button
            type="button"
            onClick={acciones.onEliminar}
            className="h-8 w-8 flex items-center justify-center rounded-card hover:bg-danger/10 text-danger"
            title="Quitar"
            aria-label="Quitar"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Presidente */}
      <div>
        <div className="text-xs uppercase tracking-wider font-semibold text-ink-mute mb-2">
          Presidente de {categoriaNombre}
        </div>
        {editando?.tipo === 'presidente' ? (
          <MiembroFormInline
            inicial={presidente}
            cargoDefault="Presidente"
            guardando={mutation.isPending}
            onGuardar={(c) => persistir(c, delegados)}
            onCancelar={() => setEditando(null)}
          />
        ) : presidente ? (
          filaMiembro(presidente, presidente.cargo ?? 'Presidente', {
            onEditar: () => setEditando({ tipo: 'presidente' }),
            onEliminar: quitarPresidente,
          })
        ) : (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => setEditando({ tipo: 'presidente' })}
          >
            <Plus size={14} /> Agregar presidente
          </Button>
        )}
      </div>

      {/* Delegados */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs uppercase tracking-wider font-semibold text-ink-mute">
            Delegados de {categoriaNombre}
          </div>
          <Button
            type="button"
            variant="accent"
            size="sm"
            onClick={() => setEditando({ tipo: 'nuevo' })}
            disabled={editando?.tipo === 'nuevo'}
          >
            <Plus size={14} /> Agregar delegado
          </Button>
        </div>
        <p className="text-[11px] text-ink-mute mb-3 leading-snug">
          Desde aquí puedes darle a un delegado <strong>acceso al sistema</strong>: verá
          plantel, resultados, sanciones y deudas de <strong>todo el club</strong> y podrá
          pagar en línea. Necesita un email. El enlace de activación vence en 72 h.
        </p>

        <div className="space-y-3">
          {delegados.map((d, idx) =>
            editando?.tipo === 'delegado' && editando.index === idx ? (
              <MiembroFormInline
                key={idx}
                inicial={d}
                cargoDefault=""
                guardando={mutation.isPending}
                onGuardar={(c) =>
                  persistir(presidente, delegados.map((x, j) => (j === idx ? c : x)))
                }
                onCancelar={() => setEditando(null)}
              />
            ) : (
              <div key={idx}>
                {filaMiembro(d, null, {
                  onEditar: () => setEditando({ tipo: 'delegado', index: idx }),
                  onEliminar: () => eliminarDelegado(idx),
                })}
              </div>
            ),
          )}

          {editando?.tipo === 'nuevo' && (
            <MiembroFormInline
              inicial={null}
              cargoDefault=""
              guardando={mutation.isPending}
              onGuardar={(c) => persistir(presidente, [...delegados, c])}
              onCancelar={() => setEditando(null)}
            />
          )}

          {delegados.length === 0 && editando?.tipo !== 'nuevo' && (
            <p className="text-xs font-serif italic text-ink-mute">
              Sin delegados cargados.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Form inline para agregar/editar un miembro. Valida email y teléfono.
 * El cargo es un select precargado (CARGOS) + "Otro" para texto libre;
 * `cargoDefault` es el valor inicial cuando el miembro aún no tiene cargo.
 */
function MiembroFormInline({
  inicial,
  cargoDefault,
  guardando,
  onGuardar,
  onCancelar,
}: {
  inicial: ContactoDirectiva | null;
  cargoDefault: string;
  guardando: boolean;
  onGuardar: (c: ContactoDirectiva) => void;
  onCancelar: () => void;
}): React.ReactElement {
  const cargoInicial = inicial?.cargo ?? cargoDefault;
  const bannerRef = useRef<HTMLDivElement>(null);
  const form = useForm<MiembroFormData>({
    resolver: zodResolver(MiembroSchema),
    defaultValues: {
      nombre: inicial?.nombre ?? '',
      cargo: cargoInicial,
      email: inicial?.email ?? '',
      telefono: inicial?.telefono ?? '',
    },
    mode: 'onTouched',
  });

  const LABEL_MAP: Record<string, string> = {
    nombre: 'Nombre',
    cargo: 'Cargo',
    email: 'Email',
    telefono: 'Teléfono',
  };
  const fieldErrors = rhfErrorsToBanner(
    form.formState.errors as Record<string, unknown>,
    LABEL_MAP,
  );

  // Si el cargo cargado no está en la lista, arranca en modo "Otro" (texto libre).
  const [modoOtro, setModoOtro] = useState(
    !!cargoInicial && !CARGOS.includes(cargoInicial as (typeof CARGOS)[number]),
  );

  const submit = (vals: MiembroFormData): void => {
    onGuardar({
      nombre: vals.nombre.trim(),
      cargo: vals.cargo?.trim() || null,
      email: vals.email?.trim() || null,
      telefono: vals.telefono?.trim() || null,
    });
  };

  return (
    <form
      onSubmit={form.handleSubmit(
        submit,
        makeRhfErrorHandler({
          formName: 'directiva-miembro',
          labelMap: LABEL_MAP,
          bannerRef,
        }),
      )}
      className="rounded-card border border-green-deep/30 bg-green-deep/[0.03] p-3 space-y-2"
    >
      <FormErrorBanner
        ref={bannerRef}
        fieldErrors={fieldErrors}
        validationTitle="Revisa los datos del miembro:"
      />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Input
          label="Nombre"
          placeholder="Apellido Nombre"
          {...form.register('nombre')}
          error={form.formState.errors.nombre?.message}
        />
        <div className="space-y-2">
          <div>
            <label className="block text-sm font-semibold text-ink mb-1">Cargo</label>
            <select
              className="w-full rounded-card border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none bg-white"
              value={modoOtro ? '__otro__' : form.watch('cargo') || ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__otro__') {
                  setModoOtro(true);
                  form.setValue('cargo', '');
                } else {
                  setModoOtro(false);
                  form.setValue('cargo', v);
                }
              }}
            >
              <option value="">Sin cargo</option>
              {CARGOS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="__otro__">Otro…</option>
            </select>
          </div>
          {modoOtro && (
            <Input
              label="Especifica el cargo"
              placeholder="Ej: Encargado de cancha"
              {...form.register('cargo')}
              error={form.formState.errors.cargo?.message}
            />
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Input
          label="Email"
          type="email"
          placeholder="contacto@club.cl"
          {...form.register('email')}
          error={form.formState.errors.email?.message}
        />
        <Input
          label="Teléfono"
          placeholder="+56 9 1234 5678"
          {...form.register('telefono')}
          error={form.formState.errors.telefono?.message}
        />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" variant="accent" size="sm" loading={guardando}>
          Guardar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
