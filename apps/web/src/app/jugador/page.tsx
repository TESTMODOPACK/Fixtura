'use client';

import { AlertTriangle } from 'lucide-react';

import type { MotivoSancion } from '@fixtura/types';

import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useMiPerfil } from '@/hooks/use-jugador';

const MOTIVO_LABEL: Record<MotivoSancion, string> = {
  ACUMULACION_AMARILLAS: 'Acumulación de amarillas',
  ROJA_DIRECTA: 'Roja directa',
  DOBLE_AMARILLA: 'Doble amarilla',
  TRIBUNAL: 'Sanción del tribunal',
};

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'amarilla' | 'roja';
}): React.ReactElement {
  const color =
    tone === 'amarilla'
      ? 'text-yellow-600'
      : tone === 'roja'
        ? 'text-danger'
        : 'text-green-deep';
  return (
    <Card padding="tight" className="text-center">
      <div className={`font-display text-4xl tracking-display ${color}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-ink-mute mt-1">{label}</div>
    </Card>
  );
}

export default function JugadorPerfilPage(): React.ReactElement {
  const { data: perfil, isLoading, error } = useMiPerfil();

  if (isLoading) {
    return <p className="text-ink-mute">Cargando tu perfil…</p>;
  }
  if (error || !perfil) {
    return (
      <Card padding="comfortable">
        <p className="text-danger font-semibold">No pudimos cargar tu perfil.</p>
        <p className="text-sm text-ink-mute mt-1">
          Reintenta más tarde o avísale a tu liga si el problema persiste.
        </p>
      </Card>
    );
  }

  const ficha: Array<{ label: string; valor: string }> = [
    { label: 'Club', valor: perfil.clubNombre },
    { label: 'Categoría', valor: perfil.categoriaNombre },
    {
      label: 'N° camiseta',
      valor: perfil.numeroCamiseta != null ? `#${perfil.numeroCamiseta}` : '—',
    },
    { label: 'Posición', valor: perfil.posicion ?? '—' },
    { label: 'Pie hábil', valor: perfil.pieHabil ?? '—' },
    { label: 'RUT', valor: perfil.rut },
  ];

  return (
    <>
      <PageHead
        eyebrow="Mi perfil"
        title={`${perfil.nombres} ${perfil.apellidos}`}
        sub={`${perfil.clubNombre} · ${perfil.categoriaNombre}`}
      />

      {perfil.sanciones.length > 0 && (
        <Card padding="comfortable" className="mb-5 border-danger/30 bg-danger/5">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="text-danger flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-danger">
                Tenés {perfil.sanciones.length} sanción
                {perfil.sanciones.length > 1 ? 'es' : ''} vigente
                {perfil.sanciones.length > 1 ? 's' : ''}
              </div>
              <ul className="mt-2 space-y-1 text-sm text-ink">
                {perfil.sanciones.map((s) => (
                  <li key={s.id}>
                    <strong>{MOTIVO_LABEL[s.motivo]}</strong> · {s.torneoNombre} —{' '}
                    {s.fechasPendientes} fecha{s.fechasPendientes > 1 ? 's' : ''} pendiente
                    {s.fechasPendientes > 1 ? 's' : ''}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
        <StatTile label="Goles" value={perfil.goles} />
        <StatTile label="Amarillas" value={perfil.amarillas} tone="amarilla" />
        <StatTile label="Rojas" value={perfil.rojas} tone="roja" />
        <StatTile label="MVP" value={perfil.mvps} />
        <StatTile label="Jugados" value={perfil.partidosJugados} />
      </div>

      <Card padding="comfortable" className="mb-5">
        <CardLabel>Ficha</CardLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 mt-3">
          {ficha.map((f) => (
            <div key={f.label}>
              <div className="text-[11px] uppercase tracking-wider text-ink-mute">{f.label}</div>
              <div className="text-sm font-semibold text-ink truncate">{f.valor}</div>
            </div>
          ))}
        </div>
      </Card>

      {perfil.porTorneo.length > 0 && (
        <Card padding="comfortable">
          <CardLabel>Por torneo</CardLabel>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-ink-mute border-b border-line">
                  <th className="py-2 pr-3">Torneo</th>
                  <th className="py-2 px-2 text-center">PJ</th>
                  <th className="py-2 px-2 text-center">Goles</th>
                  <th className="py-2 px-2 text-center">Amar.</th>
                  <th className="py-2 px-2 text-center">Rojas</th>
                  <th className="py-2 pl-2 text-center">MVP</th>
                </tr>
              </thead>
              <tbody>
                {perfil.porTorneo.map((t) => (
                  <tr key={t.torneoId} className="border-b border-line/60">
                    <td className="py-2 pr-3 font-medium text-ink">{t.torneoNombre}</td>
                    <td className="py-2 px-2 text-center">{t.partidos}</td>
                    <td className="py-2 px-2 text-center font-semibold text-green-deep">{t.goles}</td>
                    <td className="py-2 px-2 text-center">{t.amarillas}</td>
                    <td className="py-2 px-2 text-center">{t.rojas}</td>
                    <td className="py-2 pl-2 text-center">{t.mvps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
