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
  Megaphone,
  PiggyBank,
  ScrollText,
  Settings,
  ShieldCheck,
  Trophy,
  UserCog,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { ImpersonationBanner } from '@/components/impersonation-banner';
import { useIsSuperAdmin } from '@/hooks/use-admin';

import { FixturaLockup } from '@/components/ui/logo';
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
      { href: '/admin/canchas', label: 'Ocupación canchas', icon: Calendar },
      { href: '/admin/mi-suscripcion', label: 'Mi suscripción', icon: FileText },
      { href: '/admin/analytics', label: 'Analytics & NPS', icon: BarChart3, comingSoon: true },
    ],
  },
  {
    title: 'Comunidad',
    items: [
      { href: '/admin/jugadores', label: 'Jugadores & ranking', icon: Users },
      { href: '/admin/sponsors', label: 'Sponsors & banners', icon: Megaphone },
    ],
  },
  {
    title: 'Configuración',
    items: [
      { href: '/admin/personal', label: 'Personal & roles', icon: UserCog },
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

export default function AdminLayout({ children }: { children: React.ReactNode }): React.ReactElement | null {
  const pathname = usePathname();
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const isSuperAdmin = useIsSuperAdmin();

  // SUPER_ADMIN ve SOLO el menú de plataforma — no opera ligas directamente.
  // Para ver/editar datos de una liga, usa el flujo Impersonar (Sprint 21):
  // entra como un LIGA_ADMIN de esa liga, opera, y sale del modo soporte.
  // Esto separa responsabilidades:
  //   - Super Admin = plataforma (tenants, planes, métricas, health).
  //   - Liga Admin  = competición / operaciones / personal / ajustes.
  // Cuando un super admin está impersonando, el JWT que tiene es el del
  // user impersonado (LIGA_ADMIN), así que `isSuperAdmin` es false y ve
  // el NAV de liga normal + el banner naranja de impersonación.
  const sections: NavSection[] = isSuperAdmin ? [NAV_SUPER] : NAV;

  useEffect(() => {
    if (!accessToken) {
      router.replace('/');
      return;
    }
    // Super admin que entra a /admin (panel de liga) lo mandamos al
    // panel de plataforma. Si querés ver una liga, usá Impersonar.
    if (isSuperAdmin && pathname === '/admin') {
      router.replace('/admin/super');
    }
  }, [accessToken, isSuperAdmin, pathname, router]);

  if (!accessToken) {
    return null;
  }

  return (
    <div className="min-h-screen bg-paper">
      <ImpersonationBanner />
      <div className="flex">
      <aside className="hidden md:flex w-64 flex-col bg-green-deep text-chalk">
        <div className="px-5 py-6 border-b border-green-mid">
          <Link href="/">
            <FixturaLockup inverse showTag={false} />
          </Link>
        </div>
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
        <div className="px-5 py-4 border-t border-green-mid">
          <Link
            href="/"
            className="text-[10px] text-green-lime uppercase tracking-widest hover:text-chalk"
          >
            ← Portal público
          </Link>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <main className="px-6 md:px-10 py-8 max-w-7xl">{children}</main>
      </div>
      </div>
    </div>
  );
}
