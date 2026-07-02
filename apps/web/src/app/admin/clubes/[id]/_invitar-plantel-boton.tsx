'use client';

import { Send } from 'lucide-react';
import { useState } from 'react';

import type { InvitarPlantelMasivoResponse } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { useInvitarPlantelMasivo } from '@/hooks/use-jugador';
import { toastError, toastSuccess } from '@/lib/toast';

/**
 * Invitación masiva del plantel del club al portal del jugador (todas las
 * categorías, solo por email). Solo se invita a quienes tienen email y aún
 * no tienen cuenta; el resultado lista a los que quedaron fuera por no tener
 * correo, para que el admin los complete.
 */
export function InvitarPlantelBoton({
  clubId,
  clubNombre,
}: {
  clubId: string;
  clubNombre: string;
}): React.ReactElement {
  const invitar = useInvitarPlantelMasivo(clubId);
  const [resultado, setResultado] = useState<InvitarPlantelMasivoResponse | null>(
    null,
  );

  const onInvitar = (): void => {
    const ok = window.confirm(
      `¿Enviar invitación al portal a todo el plantel de "${clubNombre}"?\n\n` +
        `Se envía un correo SOLO a los jugadores con email registrado que aún ` +
        `no tienen cuenta. Los que no tienen email quedan fuera (te mostramos ` +
        `cuáles para que los completes).`,
    );
    if (!ok) return;
    invitar.mutate(undefined, {
      onSuccess: (r) => {
        setResultado(r);
        toastSuccess(
          r.invitados > 0
            ? `${r.invitados} invitación(es) enviada(s) por email.`
            : 'No había jugadores nuevos con email para invitar.',
        );
      },
      onError: (e) => toastError(e),
    });
  };

  return (
    <div className="space-y-3">
      <Button
        variant="accent"
        size="sm"
        onClick={onInvitar}
        loading={invitar.isPending}
        disabled={invitar.isPending}
      >
        <Send size={14} /> Invitar plantel al portal
      </Button>

      {resultado && (
        <Card padding="comfortable" className="text-xs max-w-md">
          <CardLabel>Resultado de la invitación</CardLabel>
          <ul className="mt-1.5 space-y-1 text-ink">
            <li>
              ✉️ Invitados por email: <strong>{resultado.invitados}</strong> de{' '}
              {resultado.total} del plantel
            </li>
            {resultado.yaActivos > 0 && (
              <li className="text-ink-mute">
                Ya tenían cuenta (se saltaron): {resultado.yaActivos}
              </li>
            )}
            {resultado.fallidos > 0 && (
              <li className="text-danger">
                No se pudo enviar el correo: {resultado.fallidos}
              </li>
            )}
            {resultado.sinEmail > 0 && (
              <li className="text-orange-700 font-semibold">
                Sin email — quedaron fuera: {resultado.sinEmail}
              </li>
            )}
          </ul>

          {resultado.saltadosSinEmail.length > 0 && (
            <div className="mt-2 border-t border-line pt-2">
              <p className="text-ink-mute mb-1">
                Completá el email de estos jugadores en su ficha para poder
                invitarlos:
              </p>
              <ul className="space-y-0.5">
                {resultado.saltadosSinEmail.map((j) => (
                  <li key={j.jugadorId}>
                    · {j.nombre}{' '}
                    <span className="text-ink-mute">({j.categoriaNombre})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
