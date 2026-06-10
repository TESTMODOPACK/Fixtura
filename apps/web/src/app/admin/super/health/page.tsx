'use client';

import { Activity, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useSystemHealth } from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { formatFechaHora } from '@/lib/format';

export default function HealthPage(): React.ReactElement {
  const { data, isLoading, error, refetch } = useSystemHealth();
  const apiError = error as ApiError | undefined;

  return (
    <>
      <PageHead
        eyebrow="Plataforma"
        title="Estado del sistema"
        sub="Salud de la base de datos, caché y tiempo en línea. Se actualiza solo cada 30 segundos."
      >
        <Link href="/admin/super">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Panel
          </Button>
        </Link>
        <Button size="sm" onClick={() => refetch()}>
          <Activity size={14} /> Refrescar
        </Button>
      </PageHead>

      {apiError && (
        <Card padding="roomy" className="border-2 border-danger/40 bg-danger/5 mb-5">
          <div className="text-sm text-danger">{apiError.message}</div>
        </Card>
      )}

      {isLoading && <p className="font-serif italic text-ink-mute">Cargando…</p>}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ServiceCard
            name="PostgreSQL"
            ok={data.db.ok}
            latencyMs={data.db.latencyMs}
            error={data.db.error}
          />
          <ServiceCard
            name="Redis"
            ok={data.redis.ok}
            latencyMs={data.redis.latencyMs}
            error={data.redis.error}
          />
          <Card padding="comfortable">
            <CardLabel>Servidor</CardLabel>
            <div className="mt-3 space-y-1 text-sm">
              <div>
                <span className="text-ink-mute">Tiempo en línea:</span>{' '}
                <span className="font-mono">
                  {Math.floor(data.uptimeSec / 3600)}h{' '}
                  {Math.floor((data.uptimeSec % 3600) / 60)}m{' '}
                  {data.uptimeSec % 60}s
                </span>
              </div>
              <div>
                <span className="text-ink-mute">Versión de Node:</span>{' '}
                <span className="font-mono">{data.nodeVersion}</span>
              </div>
              <div>
                <span className="text-ink-mute">Versión del código:</span>{' '}
                <span className="font-mono">{data.gitSha ?? '—'}</span>
              </div>
              <div>
                <span className="text-ink-mute">Última lectura:</span>{' '}
                <span className="font-mono">
                  {formatFechaHora(data.timestamp)}
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function ServiceCard({
  name,
  ok,
  latencyMs,
  error,
}: {
  name: string;
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
}): React.ReactElement {
  return (
    <Card padding="comfortable" className={ok ? '' : 'border-2 border-danger/40'}>
      <div className="flex items-center justify-between">
        <CardLabel>{name}</CardLabel>
        {ok ? (
          <CheckCircle2 size={18} className="text-green-bright" />
        ) : (
          <XCircle size={18} className="text-danger" />
        )}
      </div>
      <div className={`font-display text-2xl mt-2 ${ok ? 'text-green-bright' : 'text-danger'}`}>
        {ok ? 'OK' : 'ERROR'}
      </div>
      {latencyMs != null && (
        <div className="text-xs text-ink-mute mt-1">{latencyMs} ms</div>
      )}
      {error && <div className="text-xs text-danger mt-2 italic">{error}</div>}
    </Card>
  );
}
