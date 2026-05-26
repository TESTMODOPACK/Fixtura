'use client';

import {
  Activity,
  BarChart3,
  Calendar,
  ClipboardList,
  Gavel,
  LayoutDashboard,
  type LucideIcon,
  Megaphone,
  PiggyBank,
  Settings,
  Trophy,
  UserCog,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { use, useEffect } from 'react';

import { FixturaLockup } from '@/components/ui/logo';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/auth-store';

interface NavItem {
  slug: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    title: 'General',
    items: [{ slug: '', label: 'Panel principal', icon: LayoutDashboard }],
  },
  {
    title: 'Competición',
    items: [
      { slug: 'torneos', label: 'Torneos & fixture', icon: Trophy },
      { slug: 'designaciones', label: 'Designaciones', icon: Activity, badge: '3' },
      { slug: 'actas', label: 'Actas & resultados', icon: ClipboardList },
      { slug: 'tribunal', label: 'Tribunal', icon: Gavel },
    ],
  },
  {
    title: 'Operaciones',
    items: [
      { slug: 'finanzas', label: 'Finanzas & cobros', icon: PiggyBank },
      { slug: 'canchas', label: 'Ocupación canchas', icon: Calendar },
      { slug: 'analytics', label: 'Analytics & NPS', icon: BarChart3 },
    ],
  },
  {
    title: 'Comunidad',
    items: [
      { slug: 'jugadores', label: 'Jugadores & ranking', icon: Users },
      { slug: 'sponsors', label: 'Sponsors & banners', icon: Megaphone },
    ],
  },
  {
    title: 'Configuración',
    items: [
      { slug: 'personal', label: 'Personal & roles', icon: UserCog },
      { slug: 'ajustes', label: 'Ajustes', icon: Settings },
    ],
  },
];

export default function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ligaSlug: string }>;
}): React.ReactElement | null {
  const { ligaSlug } = use(params);
  const pathname = usePathname();
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);

  // Guard client-side: si no hay token, volver al portal público de la liga
  // (donde puede abrir el modal de login).
  useEffect(() => {
    if (!accessToken) {
      router.replace(`/${ligaSlug}`);
    }
  }, [accessToken, router, ligaSlug]);

  if (!accessToken) {
    return null;
  }

  const base = `/${ligaSlug}/admin`;
  const hrefFor = (slug: string): string => (slug ? `${base}/${slug}` : base);

  return (
    <div className="min-h-screen bg-paper flex">
      <aside className="hidden md:flex w-64 flex-col bg-green-deep text-chalk">
        <div className="px-5 py-6 border-b border-green-mid">
          <Link href={`/${ligaSlug}`}>
            <FixturaLockup inverse showTag={false} />
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {NAV.map((section) => (
            <div key={section.title}>
              <div className="px-2 mb-2 text-[10px] uppercase tracking-[0.18em] text-green-lime font-semibold">
                → {section.title}
              </div>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const href = hrefFor(item.slug);
                  const active = href === pathname || (item.slug && pathname.startsWith(`${href}/`));
                  const Icon = item.icon;
                  return (
                    <li key={item.slug || 'home'}>
                      <Link
                        href={href}
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
            href={`/${ligaSlug}`}
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
  );
}
