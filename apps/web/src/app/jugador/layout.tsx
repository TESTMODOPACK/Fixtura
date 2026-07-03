'use client';

import {
  CalendarDays,
  LayoutDashboard,
  QrCode,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LigaPlusLockup } from '@/components/ui/logo';
import { useMiPerfil } from '@/hooks/use-jugador';
import { useLogout } from '@/hooks/use-logout';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/auth-store';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: '/jugador', label: 'Mi perfil', icon: LayoutDashboard },
  { href: '/jugador/partidos', label: 'Partidos', icon: CalendarDays },
  { href: '/jugador/carnet', label: 'Mi carnet', icon: QrCode },
];

export default function JugadorLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const logout = useLogout();
  // La página de activación es pública (el jugador aún no tiene sesión).
  const esActivar = pathname?.startsWith('/jugador/activar');
  const { data: perfil } = useMiPerfil(!!accessToken && !esActivar);

  // El token rehidrata async (sessionStorage / Zustand persist): sin esperar
  // la rehidratación, un refresh ve accessToken=null y expulsa a "/".
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useAuthStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken && !esActivar) {
      router.replace('/');
    }
  }, [hydrated, accessToken, esActivar, router]);

  if (esActivar) return <>{children}</>;
  if (!hydrated || !accessToken) return null;

  return (
    <div className="min-h-screen bg-paper">
      <div className="flex">
        <aside className="hidden md:flex w-60 flex-col bg-green-deep text-chalk">
          <div className="px-5 py-6 border-b border-green-mid">
            <Link href="/jugador">
              <LigaPlusLockup inverse showTag={false} />
            </Link>
            {perfil && (
              <div className="mt-3 text-sm font-semibold text-chalk leading-tight">
                {perfil.nombres} {perfil.apellidos}
                <div className="text-[11px] text-green-lime font-normal">
                  {perfil.clubNombre}
                </div>
              </div>
            )}
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <div className="px-2 mb-2 text-[10px] uppercase tracking-[0.18em] text-green-lime font-semibold">
              → Mi perfil
            </div>
            <ul className="space-y-0.5">
              {NAV.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== '/jugador' && pathname.startsWith(`${item.href}/`));
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 px-2 py-2 rounded-card text-sm transition-colors',
                        active
                          ? 'bg-green-mid text-chalk'
                          : 'text-chalk/80 hover:bg-green-mid/50 hover:text-chalk',
                      )}
                    >
                      <Icon size={16} className="flex-shrink-0" />
                      <span className="flex-1">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="px-5 py-4 border-t border-green-mid flex flex-col gap-2">
            <Link
              href="/"
              className="text-[10px] text-green-lime uppercase tracking-widest hover:text-chalk"
            >
              ← Portal público
            </Link>
            <button
              type="button"
              onClick={logout}
              className="text-[10px] text-chalk/60 uppercase tracking-widest hover:text-chalk text-left"
            >
              Cerrar sesión
            </button>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          {/* Nav mobile simple */}
          <div className="md:hidden flex gap-1 overflow-x-auto bg-green-deep px-3 py-2">
            {NAV.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== '/jugador' && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'px-3 py-1.5 rounded-card text-xs whitespace-nowrap',
                    active ? 'bg-green-mid text-chalk' : 'text-chalk/70',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <main className="px-6 md:px-10 py-8 max-w-6xl">{children}</main>
        </div>
      </div>
    </div>
  );
}
