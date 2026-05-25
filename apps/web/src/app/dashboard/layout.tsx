'use client';

import {
  Activity,
  BarChart3,
  Calendar,
  ClipboardList,
  Gavel,
  LayoutDashboard,
  Megaphone,
  PiggyBank,
  Settings,
  Trophy,
  UserCog,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { FixturaLockup } from '@/components/ui/logo';
import { cn } from '@/lib/cn';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    title: 'General',
    items: [{ href: '/dashboard', label: 'Panel principal', icon: LayoutDashboard }],
  },
  {
    title: 'Competición',
    items: [
      { href: '/dashboard/torneos', label: 'Torneos & fixture', icon: Trophy },
      { href: '/dashboard/designaciones', label: 'Designaciones', icon: Activity, badge: '3' },
      { href: '/dashboard/actas', label: 'Actas & resultados', icon: ClipboardList },
      { href: '/dashboard/tribunal', label: 'Tribunal', icon: Gavel },
    ],
  },
  {
    title: 'Operaciones',
    items: [
      { href: '/dashboard/finanzas', label: 'Finanzas & cobros', icon: PiggyBank },
      { href: '/dashboard/canchas', label: 'Ocupación canchas', icon: Calendar },
      { href: '/dashboard/analytics', label: 'Analytics & NPS', icon: BarChart3 },
    ],
  },
  {
    title: 'Comunidad',
    items: [
      { href: '/dashboard/jugadores', label: 'Jugadores & ranking', icon: Users },
      { href: '/dashboard/sponsors', label: 'Sponsors & banners', icon: Megaphone },
    ],
  },
  {
    title: 'Configuración',
    items: [
      { href: '/dashboard/personal', label: 'Personal & roles', icon: UserCog },
      { href: '/dashboard/ajustes', label: 'Ajustes', icon: Settings },
    ],
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-paper flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-green-deep text-chalk">
        <div className="px-5 py-6 border-b border-green-mid">
          <FixturaLockup inverse showTag={false} />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {NAV.map((section) => (
            <div key={section.title}>
              <div className="px-2 mb-2 text-[10px] uppercase tracking-[0.18em] text-green-lime font-semibold">
                → {section.title}
              </div>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active =
                    item.href === pathname ||
                    (item.href !== '/dashboard' && pathname.startsWith(item.href));
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
        <div className="px-5 py-4 border-t border-green-mid text-[10px] text-green-lime uppercase tracking-widest">
          v0.1 · Fase 0
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0">
        <main className="px-6 md:px-10 py-8 max-w-7xl">{children}</main>
      </div>
    </div>
  );
}
