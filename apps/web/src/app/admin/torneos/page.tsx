'use client';

import { Plus, Trash2, Trophy } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useDeleteTorneo, useTorneos } from '@/hooks/use-admin';
import { cn } from '@/lib/cn';
import { toastSuccess } from '@/lib/toast';

const estadoBadge = (estado: string): string => {
  if (estado === 'ACTIVO') return 'bg-green-bright/10 text-green-bright';
  if (estado === 'DRAFT') return 'bg-accent/10 text-accent';
  return 'bg-ink-mute/10 text-ink-mute';
};

export default function TorneosListPage(): React.ReactElement {
  const { data: torneos, isLoading } = useTorneos();
  const deleteTorneo = useDeleteTorneo();

  const onEliminar = (id: string, nombre: string): void => {
    const ok = window.confirm(
      `¿Eliminar el torneo "${nombre}"?\n\n` +
        `Esto borra el torneo y todo lo que tenga cargado en borrador ` +
        `(equipos sin fixture, configuración, etc.). No se puede deshacer.`,
    );
    if (!ok) return;
    deleteTorneo.mutate(id, {
      onSuccess: () => {
        toastSuccess(`Torneo "${nombre}" eliminado.`);
      },
    });
  };

  return (
    <>
      <PageHead eyebrow="Competición" title="Torneos & fixture" sub="Crear, editar y administrar todos los torneos de tu liga.">
        <Link href="/admin/torneos/nuevo">
          <Button variant="accent" size="sm">
            <Plus size={14} /> Nuevo torneo
          </Button>
        </Link>
      </PageHead>

      {isLoading && <div className="font-serif italic text-ink-mute">Cargando torneos...</div>}

      {!isLoading && (!torneos || torneos.length === 0) && (
        <Card padding="roomy" className="text-center py-16">
          <Trophy size={48} className="mx-auto text-line mb-4" />
          <div className="font-display text-2xl text-green-deep tracking-display mb-2">
            AÚN NO HAY TORNEOS
          </div>
          <p className="font-serif italic text-ink-mute mb-6 max-w-md mx-auto">
            Creá tu primer torneo para empezar a inscribir equipos y generar el fixture.
          </p>
          <Link href="/admin/torneos/nuevo">
            <Button variant="accent">
              <Plus size={14} /> Crear primer torneo
            </Button>
          </Link>
        </Card>
      )}

      {torneos && torneos.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-paper-dark border-b border-line">
                <tr>
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute">Torneo</th>
                  <th className="text-left px-3 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute">Temporada</th>
                  <th className="text-left px-3 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute">Formato</th>
                  <th className="text-center px-3 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute">Equipos</th>
                  <th className="text-center px-3 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute">Fechas</th>
                  <th className="text-left px-3 py-3 text-xs uppercase tracking-wider font-semibold text-ink-mute">Estado</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {torneos.map((t) => (
                  <tr key={t.id} className="hover:bg-paper transition-colors">
                    <td className="px-5 py-4">
                      <Link href={`/admin/torneos/${t.id}`} className="font-semibold text-ink hover:text-accent">
                        {t.nombre}
                      </Link>
                      <div className="text-xs text-ink-mute font-mono">{t.slug}</div>
                    </td>
                    <td className="px-3 py-4 text-ink-mute">{t.temporadaNombre}</td>
                    <td className="px-3 py-4">
                      <span className="text-xs">{t.tipoFormato.replace('_', ' ')}</span>
                      {t.ruedas === 2 && <span className="text-xs text-ink-mute"> · ida y vuelta</span>}
                    </td>
                    <td className="text-center px-3 py-4 font-display text-lg text-green-deep tracking-display">
                      {t.equiposCount}
                    </td>
                    <td className="text-center px-3 py-4 font-display text-lg text-green-deep tracking-display">
                      {t.fechasCount}
                    </td>
                    <td className="px-3 py-4">
                      <span
                        className={cn(
                          'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded',
                          estadoBadge(t.estado),
                        )}
                      >
                        {t.estado}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-right whitespace-nowrap">
                      <Link
                        href={`/admin/torneos/${t.id}`}
                        className="text-xs text-accent hover:underline"
                      >
                        Gestionar →
                      </Link>
                      {t.estado === 'DRAFT' && (
                        <button
                          type="button"
                          onClick={() => onEliminar(t.id, t.nombre)}
                          disabled={deleteTorneo.isPending}
                          className="ml-3 text-ink-mute hover:text-danger disabled:opacity-50"
                          title="Eliminar torneo (solo en borrador)"
                          aria-label="Eliminar torneo"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
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
