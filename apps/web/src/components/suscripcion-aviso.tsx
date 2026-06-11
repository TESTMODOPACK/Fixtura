'use client';

import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useIsSuperAdmin, useMiSuscripcion } from '@/hooks/use-admin';
import { cn } from '@/lib/cn';

/**
 * F57 — Aviso previo de suscripción. Banner en el panel admin cuando la
 * liga tiene facturas de plataforma pendientes o vencidas, ANTES de
 * llegar a la suspensión (≥2 vencidas). Escala de info → urgente.
 * Se puede ocultar por sesión (reaparece al volver a entrar).
 */
export function SuscripcionAviso(): React.ReactElement | null {
  const isSuperAdmin = useIsSuperAdmin();
  const { data } = useMiSuscripcion(!isSuperAdmin);
  const [oculto, setOculto] = useState(false);

  useEffect(() => {
    setOculto(sessionStorage.getItem('ligaplus-aviso-susc-oculto') === '1');
  }, []);

  if (isSuperAdmin || oculto || !data) return null;

  // Si ya está suspendida, el guard ya la mandó a /suscripcion — no avisamos.
  if (data.estadoSuscripcion === 'SUSPENDIDO' || data.estadoSuscripcion === 'CANCELADO') {
    return null;
  }

  const vencidas = data.facturasVencidas ?? 0;
  const pendientes = data.facturasPendientes ?? 0;
  if (vencidas === 0 && pendientes === 0) return null;

  const monto = `$${(data.totalAdeudado ?? 0).toLocaleString('es-CL')}`;
  const urgente = vencidas > 0;

  const cerrar = (): void => {
    setOculto(true);
    try {
      sessionStorage.setItem('ligaplus-aviso-susc-oculto', '1');
    } catch {
      /* modo privado — no crítico */
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 text-sm border-b',
        urgente
          ? 'bg-danger/10 border-danger/30 text-danger'
          : 'bg-orange-700/10 border-orange-700/30 text-orange-700',
      )}
    >
      <AlertTriangle size={16} className="flex-shrink-0" />
      <span className="flex-1 min-w-0">
        {urgente ? (
          <>
            Tu suscripción a LigaPlus tiene <strong>{vencidas}</strong> factura
            {vencidas === 1 ? '' : 's'} vencida{vencidas === 1 ? '' : 's'} ({monto}).
            {vencidas === 1
              ? ' Si acumulás 2 vencidas se suspende el acceso a tu liga.'
              : ' Tu liga está por suspenderse.'}{' '}
            Regularizá el pago para evitarlo.
          </>
        ) : (
          <>
            Tenés <strong>{pendientes}</strong> factura{pendientes === 1 ? '' : 's'} de
            suscripción por pagar ({monto}). Pagala a tiempo para no perder el acceso.
          </>
        )}
      </span>
      <Link
        href="/admin/mi-suscripcion"
        className="inline-flex items-center gap-1 font-semibold whitespace-nowrap hover:underline"
      >
        Ir a pagar <ArrowRight size={14} />
      </Link>
      <button
        type="button"
        onClick={cerrar}
        aria-label="Ocultar aviso"
        className="p-1 rounded hover:bg-black/5 flex-shrink-0"
      >
        <X size={15} />
      </button>
    </div>
  );
}
