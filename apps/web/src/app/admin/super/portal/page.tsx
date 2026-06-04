'use client';

import { Globe, Info, Save } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import {
  usePortalConfig,
  useTenantsPlataforma,
  useUpdatePortalConfig,
} from '@/hooks/use-admin';
import { toastError, toastSuccess } from '@/lib/toast';

/**
 * Sprint 37 — Mantenedor del tenant por defecto del portal público.
 *
 * Sirve para elegir qué tenant aparece en la URL raíz cuando el hostname
 * del request no matchea ningún `tenants.custom_domain`. Útil mientras
 * los dominios de los clientes todavía no están apuntados al VPS.
 */
export default function SuperAdminPortalPage(): React.ReactElement {
  const { data: config, isLoading } = usePortalConfig();
  const { data: tenants } = useTenantsPlataforma();
  const updateMutation = useUpdatePortalConfig();

  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    if (config) {
      setSelectedId(config.defaultTenantId ?? '');
    }
  }, [config]);

  const handleGuardar = (): void => {
    updateMutation.mutate(
      { defaultTenantId: selectedId === '' ? null : selectedId },
      {
        onSuccess: () => {
          toastSuccess('Tenant por defecto actualizado.');
        },
        onError: (err) => {
          toastError(err);
        },
      },
    );
  };

  const tenantsOrdenados = [...(tenants ?? [])].sort((a, b) =>
    a.nombre.localeCompare(b.nombre),
  );

  const tenantSeleccionado = tenants?.find((t) => t.id === selectedId);
  const cambioPendiente = (config?.defaultTenantId ?? '') !== selectedId;

  return (
    <>
      <PageHead
        eyebrow="Plataforma"
        title="Portal público"
        sub="Mantenedor del tenant por defecto que se muestra cuando el hostname no matchea ningún dominio asignado."
      />

      <Card padding="roomy" className="mb-5 bg-paper-dark border-l-4 border-accent">
        <div className="flex gap-3">
          <Info size={20} className="text-accent flex-shrink-0 mt-0.5" />
          <div className="text-sm text-ink-mute leading-relaxed">
            <strong className="text-ink">¿Cuándo aplica este tenant?</strong> Solo cuando
            el dominio que el visitante usa para entrar al sistema NO matchea
            ningún <code className="text-xs bg-paper px-1 rounded">custom_domain</code>{' '}
            de la tabla de ligas. Si una liga ya tiene su dominio apuntado
            (ej: <code className="text-xs bg-paper px-1 rounded">demo.liga-norte.cl</code>),
            ese dominio gana y muestra su tenant — el aislamiento white-label se
            mantiene intacto.
            <br />
            <br />
            Caso típico: entrar al VPS por la IP cruda o por un dominio que
            todavía no está asignado a ninguna liga.
          </div>
        </div>
      </Card>

      {isLoading && (
        <div className="font-serif italic text-ink-mute">Cargando configuración…</div>
      )}

      {config && (
        <Card padding="roomy" className="max-w-2xl">
          <div className="flex items-center gap-2 mb-4">
            <Globe size={18} className="text-accent" />
            <CardLabel>Tenant que se muestra por defecto</CardLabel>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-semibold text-ink mb-1 block">
                Liga seleccionada
              </span>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full px-3 py-2 border border-line rounded font-sans bg-paper focus:border-accent focus:outline-none"
              >
                <option value="">— Sin override (usar fallback por defecto) —</option>
                {tenantsOrdenados.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre} ({t.slug})
                    {t.customDomain ? ` · ${t.customDomain}` : ''}
                  </option>
                ))}
              </select>
            </label>

            {tenantSeleccionado && (
              <Card padding="comfortable" variant="lime">
                <CardLabel tone="mute">Vista previa</CardLabel>
                <div className="mt-1 font-display text-2xl tracking-display text-green-deep">
                  {tenantSeleccionado.nombre.toUpperCase()}
                </div>
                <div className="text-xs text-ink-mute mt-1 space-y-0.5">
                  <div>slug: <span className="font-mono">{tenantSeleccionado.slug}</span></div>
                  {tenantSeleccionado.customDomain && (
                    <div>
                      dominio:{' '}
                      <span className="font-mono">{tenantSeleccionado.customDomain}</span>
                    </div>
                  )}
                  {tenantSeleccionado.planNombre && (
                    <div>plan: <span className="font-mono">{tenantSeleccionado.planNombre}</span></div>
                  )}
                </div>
              </Card>
            )}

            {!tenantSeleccionado && selectedId === '' && (
              <div className="text-xs text-ink-mute font-serif italic">
                Sin tenant seleccionado → el sistema usa los fallbacks heredados
                (variable de entorno <code>FALLBACK_TENANT_SLUG</code> o{' '}
                <code>liga-demo</code> en dev).
              </div>
            )}
          </div>

          {config.updatedAt && (
            <div className="mt-5 pt-4 border-t border-line text-xs text-ink-mute font-serif italic">
              Última actualización:{' '}
              {new Date(config.updatedAt).toLocaleString('es-CL')}
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <Button
              onClick={handleGuardar}
              disabled={!cambioPendiente || updateMutation.isPending}
            >
              <Save size={14} className="mr-2" />
              {updateMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
            </Button>
            {cambioPendiente && (
              <span className="text-xs text-accent font-semibold">
                · Tenés cambios sin guardar
              </span>
            )}
          </div>
        </Card>
      )}
    </>
  );
}
