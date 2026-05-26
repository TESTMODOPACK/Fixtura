'use client';

import Link from 'next/link';
import { useState } from 'react';

import { LoginModal } from '@/components/login-modal';
import { Button } from '@/components/ui/button';
import { FixturaMark } from '@/components/ui/logo';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/auth-store';

interface PublicHeaderProps {
  ligaNombre: string;
  active?: 'home' | 'tabla' | 'fixture' | 'goleadores' | 'asistencias' | 'mvp';
}

const TABS: Array<{ key: NonNullable<PublicHeaderProps['active']>; label: string; href: string }> = [
  { key: 'home', label: 'Inicio', href: '/' },
  { key: 'tabla', label: 'Tabla', href: '/tabla' },
  { key: 'fixture', label: 'Fixture', href: '/fixture' },
  { key: 'goleadores', label: 'Goleadores', href: '/goleadores' },
  { key: 'asistencias', label: 'Asistencias', href: '/asistencias' },
  { key: 'mvp', label: 'MVP', href: '/mvp' },
];

export function PublicHeader({ ligaNombre, active = 'home' }: PublicHeaderProps): React.ReactElement {
  const [loginOpen, setLoginOpen] = useState(false);
  const accessToken = useAuthStore((s) => s.accessToken);

  return (
    <>
      <header className="bg-green-deep text-chalk">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-3 min-w-0">
            <FixturaMark size={36} variant="lime" />
            <div className="min-w-0">
              <div className="font-display text-xl tracking-[0.12em] truncate">
                {ligaNombre.toUpperCase()}
              </div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-green-lime font-semibold">
                Temporada 2026
              </div>
            </div>
          </Link>

          {accessToken ? (
            <Link href="/admin">
              <Button variant="accent" size="sm">
                Ir al panel
              </Button>
            </Link>
          ) : (
            <Button variant="accent" size="sm" onClick={() => setLoginOpen(true)}>
              Iniciar sesión
            </Button>
          )}
        </div>

        <nav className="max-w-7xl mx-auto px-6 border-t border-green-mid">
          <ul className="flex gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const isActive = tab.key === active;
              return (
                <li key={tab.key}>
                  <Link
                    href={tab.href}
                    className={cn(
                      'inline-block px-4 py-3 text-xs uppercase tracking-[0.18em] font-semibold transition-colors border-b-2',
                      isActive
                        ? 'border-accent text-accent'
                        : 'border-transparent text-chalk/70 hover:text-chalk hover:border-green-lime',
                    )}
                  >
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}
