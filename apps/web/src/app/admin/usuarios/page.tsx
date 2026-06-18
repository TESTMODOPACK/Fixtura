'use client';

import { Mail } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ROLE_LABEL, type CategoriaUsuario, type Role, type UsuarioSistema } from '@fixtura/types';

import { Card, CardLabel } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { PageHead } from '@/components/ui/page-head';
import { useUsuariosSistema } from '@/hooks/use-admin';
import { cn } from '@/lib/cn';
import { formatFechaHora } from '@/lib/format';

const CATEGORIA_LABEL: Record<CategoriaUsuario, string> = {
  ADMIN: 'Equipo admin',
  DELEGADO: 'Delegados',
  PERSONAL: 'Personal',
  OTRO: 'Otros',
};

const CATEGORIA_BADGE: Record<CategoriaUsuario, string> = {
  ADMIN: 'bg-green-deep/10 text-green-deep',
  DELEGADO: 'bg-accent/10 text-accent',
  PERSONAL: 'bg-orange-700/10 text-orange-700',
  OTRO: 'bg-ink-mute/10 text-ink-mute',
};

type Filtro = 'TODOS' | CategoriaUsuario;

export default function UsuariosPage(): React.ReactElement {
  const { data, isLoading, error } = useUsuariosSistema();
  const [filtro, setFiltro] = useState<Filtro>('TODOS');

  const usuarios = data ?? [];
  const stats = useMemo(() => {
    const list = data ?? [];
    return {
      total: list.length,
      admin: list.filter((u) => u.categoria === 'ADMIN').length,
      delegados: list.filter((u) => u.categoria === 'DELEGADO').length,
      personal: list.filter((u) => u.categoria === 'PERSONAL').length,
    };
  }, [data]);

  const filtrados =
    filtro === 'TODOS' ? usuarios : usuarios.filter((u) => u.categoria === filtro);

  return (
    <>
      <PageHead
        eyebrow="Configuración"
        title="Usuarios del sistema"
        sub="Todas las cuentas que pueden iniciar sesión en la liga: equipo admin, delegados de club y personal."
      />

      <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total" value={isLoading ? '…' : stats.total} />
        <KpiCard label="Equipo admin" value={isLoading ? '…' : stats.admin} />
        <KpiCard label="Delegados" value={isLoading ? '…' : stats.delegados} />
        <KpiCard label="Personal" value={isLoading ? '…' : stats.personal} />
      </div>

      <div className="flex gap-1 flex-wrap mb-5">
        {(['TODOS', 'ADMIN', 'DELEGADO', 'PERSONAL', 'OTRO'] as Filtro[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium transition',
              filtro === f
                ? 'bg-green-deep text-chalk'
                : 'bg-paper-2 text-ink-mute hover:bg-paper-dark',
            )}
          >
            {f === 'TODOS' ? 'Todos' : CATEGORIA_LABEL[f]}
          </button>
        ))}
      </div>

      <Card padding="none" className="overflow-hidden">
        {isLoading && <div className="p-8 text-center text-ink-mute font-serif italic">Cargando…</div>}
        {error && (
          <div className="p-8 text-center text-danger">No pudimos cargar los usuarios.</div>
        )}
        {!isLoading && !error && filtrados.length === 0 && (
          <div className="p-8 text-center text-ink-mute font-serif italic">
            No hay usuarios para el filtro elegido.
          </div>
        )}
        {filtrados.length > 0 && (
          <div className="divide-y divide-line">
            {filtrados.map((u) => (
              <UsuarioRow key={u.userId} u={u} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function UsuarioRow({ u }: { u: UsuarioSistema }): React.ReactElement {
  return (
    <div className="px-5 py-3 flex items-center gap-4 flex-wrap">
      <div className="flex-1 min-w-[220px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-ink">
            {u.nombre} {u.apellido}
          </span>
          <span
            className={cn(
              'text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold',
              CATEGORIA_BADGE[u.categoria],
            )}
          >
            {CATEGORIA_LABEL[u.categoria]}
          </span>
          {!u.activo && (
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold bg-ink-mute/15 text-ink-mute">
              inactivo
            </span>
          )}
        </div>
        <div className="text-xs text-ink-mute mt-0.5 flex items-center gap-1">
          <Mail size={11} /> {u.email}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 min-w-[200px] flex-1">
        {u.roles.map((r, i) => (
          <span
            key={`${r.role}-${i}`}
            className="text-[10px] px-2 py-0.5 rounded bg-paper-dark text-ink-mute"
            title={r.contexto ?? undefined}
          >
            {ROLE_LABEL[r.role as Role] ?? r.role}
            {r.contexto ? ` · ${r.contexto}` : ''}
          </span>
        ))}
      </div>

      <div className="text-[11px] text-ink-mute w-40 text-right shrink-0">
        {u.ultimoLoginAt ? `Último login ${formatFechaHora(u.ultimoLoginAt)}` : 'Nunca ingresó'}
      </div>
    </div>
  );
}
