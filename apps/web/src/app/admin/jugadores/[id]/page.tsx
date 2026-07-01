'use client';

import {
  AlertTriangle,
  ArrowLeft,
  Gavel,
  Mail,
  Phone,
  Shield,
  ShieldOff,
  Star,
  Trophy,
  User,
} from 'lucide-react';
import Link from 'next/link';

import type { JugadorGlobalDetalle } from '@fixtura/types';

import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useJugadorGlobalDetalle } from '@/hooks/use-admin';
import { cn } from '@/lib/cn';

const MOTIVO_LABEL: Record<string, string> = {
  ACUMULACION_AMARILLAS: 'Acumulación de amarillas',
  ROJA_DIRECTA: 'Roja directa',
  DOBLE_AMARILLA: 'Doble amarilla',
  TRIBUNAL: 'Tribunal de disciplina',
};

export default function JugadorDetallePage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  const { id } = params;
  const { data: jugador, isLoading, error } = useJugadorGlobalDetalle(id);

  return (
    <>
      <Link
        href="/admin/jugadores"
        className="inline-flex items-center gap-1.5 text-sm text-ink-mute hover:text-ink mb-4"
      >
        <ArrowLeft size={15} /> Volver a Jugadores
      </Link>

      {isLoading && (
        <p className="font-serif italic text-ink-mute py-8">Cargando jugador…</p>
      )}

      {!isLoading && (error || !jugador) && (
        <Card className="text-center py-12">
          <User size={36} className="mx-auto text-line mb-3" />
          <p className="font-serif italic text-ink-mute">
            No se encontró este jugador.{' '}
            <Link
              href="/admin/jugadores"
              className="text-accent font-semibold hover:underline"
            >
              Volver al listado
            </Link>
            .
          </p>
        </Card>
      )}

      {!isLoading && jugador && <Detalle jugador={jugador} />}
    </>
  );
}

function Detalle({ jugador }: { jugador: JugadorGlobalDetalle }): React.ReactElement {
  const esVetado = jugador.estado === 'VETADO';
  const esInactivo = jugador.estado === 'INACTIVO';

  return (
    <>
      <PageHead
        eyebrow="Jugador"
        title={`${jugador.nombres} ${jugador.apellidos}`}
        sub={`${jugador.clubNombre} · ${jugador.categoriaNombre}`}
      >
        <div className="flex flex-wrap items-center gap-1.5 justify-end">
          {jugador.capitan && (
            <span className="flex items-center gap-1 px-2 py-1 rounded text-[10px] uppercase tracking-wider font-semibold bg-accent/15 text-accent">
              <Star size={11} className="fill-accent" /> Capitán
            </span>
          )}
          {esVetado && (
            <span className="flex items-center gap-1 px-2 py-1 rounded text-[10px] uppercase tracking-wider font-semibold bg-danger/15 text-danger">
              <ShieldOff size={11} /> Vetado
            </span>
          )}
          {esInactivo && (
            <span className="px-2 py-1 rounded text-[10px] uppercase tracking-wider font-semibold bg-ink-mute/15 text-ink-mute">
              Inactivo
            </span>
          )}
          {jugador.tieneSancionActiva && (
            <span className="flex items-center gap-1 px-2 py-1 rounded text-[10px] uppercase tracking-wider font-semibold bg-accent/15 text-accent">
              <AlertTriangle size={11} /> Con sanción
            </span>
          )}
        </div>
      </PageHead>

      {esVetado && jugador.vetoMotivo && (
        <Card variant="default" className="mb-6 border-l-4 border-danger bg-danger/5">
          <div className="flex items-start gap-2">
            <ShieldOff size={16} className="text-danger flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-danger text-sm">
                Jugador vetado de la liga
              </div>
              <p className="text-sm text-ink-mute mt-0.5">{jugador.vetoMotivo}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Stats agregadas (todos los torneos donde participó) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Card padding="comfortable">
          <CardLabel tone="mute">Partidos</CardLabel>
          <div className="font-display text-3xl text-green-deep tracking-display">
            {jugador.partidosJugados}
          </div>
        </Card>
        <Card padding="comfortable" variant="lime">
          <CardLabel tone="mute">Goles</CardLabel>
          <div className="font-display text-3xl text-green-deep tracking-display">
            {jugador.goles}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel tone="mute">Amarillas</CardLabel>
          <div className="font-display text-3xl text-green-bright tracking-display">
            {jugador.amarillas}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel tone="mute">Rojas</CardLabel>
          <div
            className={cn(
              'font-display text-3xl tracking-display',
              jugador.rojas > 0 ? 'text-danger' : 'text-ink-mute',
            )}
          >
            {jugador.rojas}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel tone="mute">MVP</CardLabel>
          <div className="font-display text-3xl text-accent tracking-display">
            {jugador.mvps}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ficha */}
        <Card>
          <CardLabel>Ficha</CardLabel>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Dato label="RUT">
              <span className="font-mono">{jugador.rut}</span>
            </Dato>
            <Dato label="Edad">
              {jugador.edad != null ? `${jugador.edad} años` : '—'}
            </Dato>
            <Dato label="Posición">
              <span className="capitalize">
                {jugador.posicion ? jugador.posicion.toLowerCase() : '—'}
              </span>
            </Dato>
            <Dato label="N° camiseta">
              {jugador.numeroCamiseta != null ? (
                <span className="font-mono">#{jugador.numeroCamiseta}</span>
              ) : (
                '—'
              )}
            </Dato>
            <Dato label="Pie hábil">
              <span className="capitalize">
                {jugador.pieHabil ? jugador.pieHabil.toLowerCase() : '—'}
              </span>
            </Dato>
            <Dato label="Apodo">{jugador.apodo ? `« ${jugador.apodo} »` : '—'}</Dato>
            <Dato label="Email">
              {jugador.email ? (
                <span className="flex items-center gap-1 break-all">
                  <Mail size={12} className="text-ink-mute flex-shrink-0" />
                  {jugador.email}
                </span>
              ) : (
                '—'
              )}
            </Dato>
            <Dato label="Teléfono">
              {jugador.telefono ? (
                <span className="flex items-center gap-1">
                  <Phone size={12} className="text-ink-mute flex-shrink-0" />
                  {jugador.telefono}
                </span>
              ) : (
                '—'
              )}
            </Dato>
            {(jugador.nombreContacto || jugador.telefonoContacto) && (
              <Dato label="Contacto de emergencia" full>
                <span className="text-sm">
                  {jugador.nombreContacto ?? 'Sin nombre'}
                  {jugador.telefonoContacto && (
                    <span className="text-ink-mute"> · {jugador.telefonoContacto}</span>
                  )}
                </span>
              </Dato>
            )}
          </div>

          <Link
            href={`/admin/clubes/${jugador.clubId}`}
            className="inline-flex items-center gap-1.5 mt-5 text-sm text-accent font-semibold hover:underline"
          >
            <Shield size={13} /> Ver ficha del club
          </Link>
        </Card>

        {/* Sanciones activas */}
        <Card>
          <CardLabel tone={jugador.sanciones.length > 0 ? 'accent' : 'mute'}>
            Sanciones activas
          </CardLabel>
          {jugador.sanciones.length === 0 ? (
            <p className="font-serif italic text-ink-mute text-sm py-2">
              Sin sanciones vigentes.
            </p>
          ) : (
            <div className="space-y-3">
              {jugador.sanciones.map((s) => (
                <div
                  key={s.id}
                  className="border-l-4 border-accent bg-accent/5 rounded-r p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-semibold text-sm">
                      <Gavel size={13} className="text-accent" />
                      {MOTIVO_LABEL[s.motivo] ?? s.motivo}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-accent/15 text-accent whitespace-nowrap">
                      {s.fechasPendientes}{' '}
                      {s.fechasPendientes === 1 ? 'fecha' : 'fechas'} pend.
                    </span>
                  </div>
                  <div className="text-xs text-ink-mute mt-1">{s.torneoNombre}</div>
                  {s.descripcion && (
                    <p className="text-xs text-ink mt-1.5">{s.descripcion}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Desglose por torneo */}
      <Card padding="none" className="mt-6 overflow-hidden">
        <div className="px-6 pt-6 pb-3">
          <CardLabel>Rendimiento por torneo</CardLabel>
        </div>
        {jugador.porTorneo.length === 0 ? (
          <p className="font-serif italic text-ink-mute text-sm px-6 pb-6">
            Todavía no registra incidencias en ningún torneo.
          </p>
        ) : (
          <div>
            {jugador.porTorneo.map((t) => (
              <div
                key={t.torneoId}
                className="flex items-center justify-between gap-3 px-6 py-3 border-t border-line"
              >
                <div className="font-semibold text-sm min-w-0 truncate flex items-center gap-1.5">
                  <Trophy size={13} className="text-ink-mute flex-shrink-0" />
                  {t.torneoNombre}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-mono text-ink-mute flex-shrink-0 justify-end">
                  <span>{t.partidos} PJ</span>
                  <span className="text-ink font-semibold">{t.goles} ⚽</span>
                  <span>{t.amarillas} 🟨</span>
                  {t.rojas > 0 && <span className="text-danger">{t.rojas} 🟥</span>}
                  {t.mvps > 0 && <span>{t.mvps} MVP</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function Dato({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}): React.ReactElement {
  return (
    <div className={cn(full && 'col-span-2')}>
      <div className="text-[10px] uppercase tracking-[0.15em] text-ink-mute font-semibold mb-0.5">
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
