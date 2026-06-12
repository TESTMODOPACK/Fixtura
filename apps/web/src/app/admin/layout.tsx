'use client';

import {
  Activity,
  BarChart3,
  Calendar,
  ClipboardList,
  Gavel,
  LayoutDashboard,
  type LucideIcon,
  Building2,
  FileText,
  Heart,
  Layers,
  LogOut,
  Megaphone,
  Menu,
  PiggyBank,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  ShieldOff,
  Trophy,
  UserCog,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ImpersonationBanner } from '@/components/impersonation-banner';
import { SuscripcionAviso } from '@/components/suscripcion-aviso';
import { useIsSuperAdmin } from '@/hooks/use-admin';

import { LigaPlusLockup } from '@/components/ui/logo';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/auth-store';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  comingSoon?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

// Los items con `comingSoon: true` se muestran como deshabilitados.
// Cuando se construya la página, basta con quitar la flag.
const NAV: NavSection[] = [
  {
    title: 'General',
    items: [{ href: '/admin', label: 'Panel principal', icon: LayoutDashboard }],
  },
  {
    title: 'Competición',
    items: [
      { href: '/admin/torneos', label: 'Torneos & fixture', icon: Trophy },
      { href: '/admin/designaciones', label: 'Designación de personal', icon: Activity },
      { href: '/admin/actas', label: 'Actas & resultados', icon: ClipboardList },
      { href: '/admin/tribunal', label: 'Tribunal', icon: Gavel },
    ],
  },
  {
    title: 'Operaciones',
    items: [
      { href: '/admin/finanzas', label: 'Finanzas & cobros', icon: PiggyBank },
      { href: '/admin/pagos-personal', label: 'Pagos a personal', icon: Wallet },
      { href: '/admin/canchas', label: 'Ocupación canchas', icon: Calendar },
      { href: '/admin/mi-suscripcion', label: 'Mi suscripción', icon: FileText },
      { href: '/admin/analytics', label: 'Analytics & NPS', icon: BarChart3, comingSoon: true },
    ],
  },
  {
    title: 'Comunidad',
    items: [
      { href: '/admin/clubes', label: 'Clubes', icon: Shield },
      { href: '/admin/jugadores', label: 'Jugadores & ranking', icon: Users },
      { href: '/admin/vetados', label: 'Jugadores vetados', icon: ShieldOff },
      { href: '/admin/sponsors', label: 'Sponsors & banners', icon: Megaphone },
    ],
  },
  {
    title: 'Configuración',
    items: [
      { href: '/admin/personal', label: 'Personal & roles', icon: UserCog },
      { href: '/admin/categorias', label: 'Categorías y series', icon: Layers },
      { href: '/admin/ajustes', label: 'Ajustes', icon: Settings },
      { href: '/admin/audit-log', label: 'Audit log', icon: ScrollText },
    ],
  },
];

// Sección visible solo para SUPER_ADMIN (Sprint 23). Se monta condicional
// abajo según `useIsSuperAdmin()`.
const NAV_SUPER: NavSection = {
  title: 'Plataforma',
  items: [
    { href: '/admin/super', label: 'Panel principal', icon: ShieldCheck },
    { href: '/admin/super/tenants', label: 'Ligas (tenants)', icon: Building2 },
    { href: '/admin/super/planes', label: 'Planes de suscripción', icon: PiggyBank },
    { href: '/admin/super/facturas', label: 'Facturas a ligas', icon: FileText },
    { href: '/admin/super/impersonate', label: 'Entrar como…', icon: UserCog },
    { href: '/admin/super/health', label: 'Estado del sistema', icon: Heart },
  ],
};

/** Lista de secciones de navegación — reutilizada en sidebar y drawer. */
function NavBody({
  sections,
  pathname,
  onNavigate,
}: {
  sections: NavSection[];
  pathname: string;
  onNavigate?: () => void;
}): React.ReactElement {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
      {sections.map((section) => (
        <div key={section.title}>
          <div className="px-2 mb-2 text-[10px] uppercase tracking-[0.18em] text-green-lime font-semibold">
            → {section.title}
          </div>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active =
                !item.comingSoon &&
                (pathname === item.href ||
                  (item.href !== '/admin' && pathname.startsWith(`${item.href}/`)));
              const Icon = item.icon;
              if (item.comingSoon) {
                return (
                  <li key={item.href}>
                    <div
                      aria-disabled="true"
                      title="Disponible en próximos sprints"
                      className="flex items-center gap-3 px-2 py-2 rounded-card text-sm text-chalk/40 cursor-not-allowed"
                    >
                      <Icon size={16} className="flex-shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-chalk/10 text-chalk/60">
                        pronto
                      </span>
                    </div>
                  </li>
                );
              }
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-3 px-2 py-2 rounded-card text-sm transition-colors',
                      active
                        ? 'bg-green-mid text-chalk'
                        : 'text-chalk/80 hover:bg-green-mid/50 hover:text-chalk',
                    )}
                  >
                    <Icon size={16} className="flex-shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent text-chalk">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }): React.ReactElement | null {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const clearTokens = useAuthStore((s) => s.clearTokens);
  const isSuperAdmin = useIsSuperAdmin();
  const [menuOpen, setMenuOpen] = useState(false);

  // SUPER_ADMIN ve SOLO el menú de plataforma — no opera ligas directamente.
  const sections: NavSection[] = isSuperAdmin ? [NAV_SUPER] : NAV;

  useEffect(() => {
    if (!accessToken) {
      router.replace('/');
      return;
    }
    if (isSuperAdmin && pathname === '/admin') {
      router.replace('/admin/super');
    }
  }, [accessToken, isSuperAdmin, pathname, router]);

  // Cerrar el drawer al navegar (cambio de ruta).
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (!accessToken) {
    return null;
  }

  return (
    <div className="min-h-screen bg-paper">
      <ImpersonationBanner />
      <SuscripcionAviso />
      <div className="flex">
        {/* Sidebar desktop */}
        <aside className="hidden md:flex w-64 flex-col bg-green-deep text-chalk">
          <div className="px-5 py-6 border-b border-green-mid">
            <Link href="/">
              <LigaPlusLockup inverse showTag={false} />
            </Link>
          </div>
          <NavBody sections={sections} pathname={pathname} />
          <div className="px-5 py-4 border-t border-green-mid flex flex-col gap-2">
            <Link
              href="/"
              className="text-[10px] text-green-lime uppercase tracking-widest hover:text-chalk"
            >
              ← Portal público
            </Link>
            <button
              type="button"
              onClick={() => {
                clearTokens();
                router.replace('/');
              }}
              className="inline-flex items-center gap-1.5 text-[10px] text-chalk/60 uppercase tracking-widest hover:text-chalk text-left"
            >
              <LogOut size={12} /> Cerrar sesión
            </button>
          </div>
        </aside>

        {/* Topbar móvil */}
        <div className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between bg-green-deep text-chalk px-4 h-14 border-b border-green-mid">
          <Link href="/">
            <LigaPlusLockup inverse showTag={false} />
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
            className="p-2 -mr-2 rounded-card hover:bg-green-mid/50"
          >
            <Menu size={22} />
          </button>
        </div>

        {/* Drawer móvil */}
        {menuOpen && (
          <div className="md:hidden fixed inset-0 z-40">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute left-0 top-0 h-full w-72 max-w-[85%] bg-green-deep text-chalk flex flex-col shadow-xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-green-mid">
                <LigaPlusLockup inverse showTag={false} />
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Cerrar menú"
                  className="p-2 -mr-2 rounded-card hover:bg-green-mid/50"
                >
                  <X size={20} />
                </button>
              </div>
              <NavBody
                sections={sections}
                pathname={pathname}
                onNavigate={() => setMenuOpen(false)}
              />
              <div className="px-5 py-4 border-t border-green-mid flex flex-col gap-2">
                <Link
                  href="/"
                  onClick={() => setMenuOpen(false)}
                  className="text-[10px] text-green-lime uppercase tracking-widest hover:text-chalk"
                >
                  ← Portal público
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    clearTokens();
                    router.replace('/');
                  }}
                  className="inline-flex items-center gap-1.5 text-[10px] text-chalk/60 uppercase tracking-widest hover:text-chalk text-left"
                >
                  <LogOut size={12} /> Cerrar sesión
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Spacer para la topbar fija en móvil */}
          <div className="h-14 md:hidden" />
          <main className="px-6 md:px-10 py-8 max-w-7xl">{children}</main>
        </div>
      </div>
    </div>
  );
}
