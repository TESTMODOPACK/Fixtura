'use client';

import { CheckCircle2, Clock, Mail, Send, UserPlus } from 'lucide-react';
import { useState } from 'react';

import type { CanalInvitacionDelegado } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { useDelegadoCuenta, useInvitarDelegado } from '@/hooks/use-delegado';
import { toastError, toastSuccess } from '@/lib/toast';

/**
 * Tarjeta de gestión del acceso del DELEGADO del club (F55). El delegado es
 * de alcance club (ve todas las categorías), por eso vive en la ficha del
 * club y no por categoría.
 */
export function DelegadoClubCard({ clubId }: { clubId: string }): React.ReactElement {
  const { data: cuenta } = useDelegadoCuenta(clubId);
  const invitar = useInvitarDelegado(clubId);

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [canal, setCanal] = useState<CanalInvitacionDelegado>('EMAIL');
  const [abierto, setAbierto] = useState(false);

  const onInvitar = (e: React.FormEvent): void => {
    e.preventDefault();
    invitar.mutate(
      { nombre, email, telefono: telefono || null, canal },
      {
        onSuccess: (res) => {
          toastSuccess(res.mensaje);
          setNombre('');
          setEmail('');
          setTelefono('');
          setAbierto(false);
        },
        onError: (err) => toastError(err),
      },
    );
  };

  return (
    <Card padding="roomy" className="mb-5">
      <CardLabel>Acceso del delegado</CardLabel>
      <p className="text-sm text-ink-mute mt-1 mb-3">
        El delegado puede ver el plantel, resultados, tarjetas, sanciones y las
        deudas del club — y pagar en línea. No edita datos del torneo.
      </p>

      {cuenta?.estado === 'ACTIVA' && (
        <div className="flex items-center gap-2 text-sm bg-green-bright/10 border border-green-bright/30 rounded-card px-3 py-2">
          <CheckCircle2 size={16} className="text-green-bright" />
          <span className="text-ink">
            Cuenta activa: <strong>{cuenta.nombre}</strong>{' '}
            <span className="text-ink-mute">({cuenta.email})</span>
          </span>
        </div>
      )}

      {cuenta?.estado === 'PENDIENTE' && (
        <div className="flex items-center gap-2 text-sm bg-orange-700/10 border border-orange-700/30 rounded-card px-3 py-2 mb-3">
          <Clock size={16} className="text-orange-700" />
          <span className="text-ink">
            Invitación enviada a <strong>{cuenta.email}</strong> — pendiente de activación.
          </span>
        </div>
      )}

      {(cuenta?.estado === 'SIN_INVITAR' || cuenta?.estado === 'PENDIENTE') && !abierto && (
        <Button variant="accent" size="sm" onClick={() => setAbierto(true)} className="mt-1">
          <UserPlus size={14} /> {cuenta.estado === 'PENDIENTE' ? 'Reenviar invitación' : 'Invitar delegado'}
        </Button>
      )}

      {abierto && (
        <form onSubmit={onInvitar} className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Nombre del delegado</label>
            <input
              className="input"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              minLength={2}
            />
          </div>
          <div>
            <label className="label">Email (será su usuario)</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Teléfono (opcional)</label>
            <input
              className="input"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="+56 9 ..."
            />
          </div>
          <div>
            <label className="label">Enviar por</label>
            <select
              className="input"
              value={canal}
              onChange={(e) => setCanal(e.target.value as CanalInvitacionDelegado)}
            >
              <option value="EMAIL">Email</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="AMBOS">Email + WhatsApp</option>
            </select>
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <Button type="submit" variant="accent" size="sm" loading={invitar.isPending}>
              <Send size={14} /> Enviar invitación
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <span className="text-xs text-ink-mute flex items-center gap-1">
              <Mail size={12} /> El enlace vence en 72 horas.
            </span>
          </div>
        </form>
      )}
    </Card>
  );
}
