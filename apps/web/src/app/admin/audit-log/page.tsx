'use client';

import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ScrollText,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import { useAuditActions, useAuditLog } from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';

export default function AuditLogPage(): React.ReactElement {
  const [page, setPage] = useState(1);
  const [actionPrefix, setActionPrefix] = useState('');
  const [userId, setUserId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const { data, isLoading, error, refetch } = useAuditLog({
    actionPrefix: actionPrefix || undefined,
    userId: userId || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
    page,
    limit: 50,
  });
  const { data: acciones } = useAuditActions();
  const apiError = error as ApiError | undefined;

  return (
    <>
      <PageHead
        eyebrow="Seguridad"
        title="Audit log"
        sub="Registro inmutable de acciones críticas. Solo lectura."
      >
        <Link href="/admin">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Panel
          </Button>
        </Link>
      </PageHead>

      <Card padding="comfortable" className="mb-5">
        <CardLabel>Filtros</CardLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <div>
            <label className="block text-xs uppercase tracking-[0.18em] font-semibold text-ink-mute mb-1">
              Acción / prefijo
            </label>
            <Input
              list="acciones"
              placeholder="auth., partido.acta_cerrada…"
              value={actionPrefix}
              onChange={(e) => {
                setActionPrefix(e.target.value);
                setPage(1);
              }}
            />
            <datalist id="acciones">
              {acciones?.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-[0.18em] font-semibold text-ink-mute mb-1">
              User ID
            </label>
            <Input
              placeholder="UUID del usuario"
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-[0.18em] font-semibold text-ink-mute mb-1">
              Desde
            </label>
            <Input
              type="date"
              value={desde}
              onChange={(e) => {
                setDesde(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-[0.18em] font-semibold text-ink-mute mb-1">
              Hasta
            </label>
            <Input
              type="date"
              value={hasta}
              onChange={(e) => {
                setHasta(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </Card>

      {isLoading && (
        <div className="font-serif italic text-ink-mute">Cargando…</div>
      )}

      {apiError && (
        <Card padding="roomy" className="border-2 border-danger/40 bg-danger/5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-danger flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-display tracking-display text-xl text-danger mb-1">
                NO PUDIMOS CARGAR EL AUDIT LOG
              </div>
              <div className="text-sm text-danger mb-3">{apiError.message}</div>
              <button
                type="button"
                onClick={() => refetch()}
                className="text-sm text-accent hover:underline font-semibold"
              >
                ↺ Reintentar
              </button>
            </div>
          </div>
        </Card>
      )}

      {data && (
        <>
          <Card padding="none" className="overflow-hidden">
            <div className="px-5 py-3 bg-paper-dark border-b border-line flex items-center justify-between">
              <CardLabel>
                {data.meta.total} entrada{data.meta.total === 1 ? '' : 's'}
              </CardLabel>
              <span className="text-xs text-ink-mute">
                Página {data.meta.page} de {data.meta.totalPages}
              </span>
            </div>
            {data.items.length === 0 ? (
              <div className="p-8 text-center text-sm text-ink-mute font-serif italic">
                <ScrollText size={32} className="mx-auto mb-3 text-line" />
                Sin resultados para esos filtros.
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {data.items.map((it) => (
                  <li key={it.id} className="px-5 py-3 grid grid-cols-12 gap-3 items-start text-sm">
                    <div className="col-span-12 md:col-span-3 text-ink-mute font-mono text-xs">
                      {new Date(it.createdAt).toLocaleString('es-CL', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </div>
                    <div className="col-span-12 md:col-span-3 font-semibold text-ink truncate">
                      {it.action}
                    </div>
                    <div className="col-span-12 md:col-span-3 text-ink-mute text-xs truncate">
                      {it.entityType ? (
                        <>
                          <span className="font-mono">{it.entityType}</span>
                          {it.entityId && (
                            <span className="ml-1 font-mono opacity-60">
                              · {it.entityId.slice(0, 8)}…
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="italic">—</span>
                      )}
                    </div>
                    <div className="col-span-12 md:col-span-3 text-ink-mute text-xs">
                      {it.userId ? (
                        <span className="font-mono">user {it.userId.slice(0, 8)}…</span>
                      ) : (
                        <span className="italic">sistema</span>
                      )}
                      {it.ipAddress && (
                        <span className="block opacity-60 font-mono">{it.ipAddress}</span>
                      )}
                    </div>
                    {Object.keys(it.metadata).length > 0 && (
                      <div className="col-span-12 mt-1 ml-0 md:ml-0">
                        <details className="text-xs">
                          <summary className="cursor-pointer text-ink-mute hover:text-ink">
                            metadata
                          </summary>
                          <pre className="mt-1 p-2 bg-paper-dark rounded text-[10px] overflow-x-auto">
                            {JSON.stringify(it.metadata, null, 2)}
                          </pre>
                        </details>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {data.meta.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button
                variant="default"
                size="sm"
                disabled={data.meta.page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={14} /> Anterior
              </Button>
              <Button
                variant="default"
                size="sm"
                disabled={data.meta.page >= data.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente <ChevronRight size={14} />
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
