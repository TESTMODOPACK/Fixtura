'use client';

import {
  Activity,
  BookOpen,
  Calendar,
  CalendarRange,
  ChevronDown,
  ClipboardList,
  type LucideIcon,
  PiggyBank,
  Settings,
  Shield,
  Trophy,
  UserCog,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';

interface Paso {
  icon: LucideIcon;
  titulo: string;
  desc: string;
  href: string;
}

const PASOS: Paso[] = [
  {
    icon: Settings,
    titulo: 'Configura tu liga',
    desc: 'Datos, calendario y feriados, reglas de desempate y si usas carnet ANFA.',
    href: '/admin/ajustes',
  },
  {
    icon: Calendar,
    titulo: 'Carga las canchas',
    desc: 'Los recintos donde se juega, con su estado y disponibilidad.',
    href: '/admin/canchas',
  },
  {
    icon: Shield,
    titulo: 'Crea los clubes y su plantel',
    desc: 'Cada club por categoría, su directiva y los jugadores (puedes importar por Excel).',
    href: '/admin/clubes',
  },
  {
    icon: UserCog,
    titulo: 'Registra el personal',
    desc: 'Árbitros, planilleros y paramédicos, con su tarifa y datos de pago.',
    href: '/admin/personal',
  },
  {
    icon: Trophy,
    titulo: 'Crea el torneo',
    desc: 'Categoría y serie, duración del partido y el tarifario de cuotas y matrícula.',
    href: '/admin/torneos/nuevo',
  },
  {
    icon: ClipboardList,
    titulo: 'Inscribe clubes y carga la planilla',
    desc: 'Suma los clubes al torneo y registra la planilla habilitada por categoría.',
    href: '/admin/torneos',
  },
  {
    icon: CalendarRange,
    titulo: 'Genera el fixture',
    desc: 'Define los horarios y genera el calendario de partidos automáticamente.',
    href: '/admin/torneos',
  },
  {
    icon: Activity,
    titulo: 'Designa el personal',
    desc: 'Asigna árbitros a cada partido — manual o con auto-asignación.',
    href: '/admin/designaciones',
  },
  {
    icon: ClipboardList,
    titulo: 'Carga las actas',
    desc: 'Resultados, goles, tarjetas e incidencias. Las sanciones se aplican solas.',
    href: '/admin/actas',
  },
  {
    icon: PiggyBank,
    titulo: 'Cobros y pagos',
    desc: 'Sigue cuotas y morosos, habilita el pago online y liquida al personal.',
    href: '/admin/finanzas',
  },
];

const LS_KEY = 'ligaplus-guia-uso-abierta';

/**
 * Guía de uso del panel de administración — pasos para poner la liga en
 * marcha. Colapsable; el estado abierta/cerrada se recuerda por navegador.
 */
export function GuiaUso(): React.ReactElement {
  const [abierta, setAbierta] = useState(true);

  useEffect(() => {
    const guardado = window.localStorage.getItem(LS_KEY);
    if (guardado === 'false') setAbierta(false);
  }, []);

  const toggle = (): void => {
    setAbierta((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(LS_KEY, String(next));
      } catch {
        /* modo privado — no crítico */
      }
      return next;
    });
  };

  return (
    <Card padding="none" className="mb-6 overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={abierta}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-paper-dark transition-colors"
      >
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-card bg-green-deep text-chalk">
          <BookOpen size={18} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-display tracking-display text-lg text-green-deep leading-none">
            GUÍA DE USO
          </span>
          <span className="block text-xs text-ink-mute mt-0.5">
            Cómo poner tu liga en marcha, paso a paso.
          </span>
        </span>
        <ChevronDown
          size={20}
          className={cn(
            'flex-shrink-0 text-ink-mute transition-transform',
            abierta && 'rotate-180',
          )}
        />
      </button>

      {abierta && (
        <div className="border-t border-line px-5 py-4">
          <ol className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {PASOS.map((paso, idx) => {
              const Icon = paso.icon;
              return (
                <li key={paso.titulo}>
                  <Link
                    href={paso.href}
                    className="flex items-start gap-3 rounded-card border border-line px-3 py-2.5 hover:border-accent hover:bg-paper-dark transition-colors h-full"
                  >
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-green-lime/40 font-display text-sm text-green-deep">
                      {idx + 1}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5 font-semibold text-sm text-green-deep">
                        <Icon size={14} className="text-accent flex-shrink-0" />
                        {paso.titulo}
                      </span>
                      <span className="block text-xs text-ink-mute mt-0.5 leading-snug">
                        {paso.desc}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-ink-mute mt-3 italic">
            No hace falta seguir el orden exacto, pero esta secuencia es la más
            simple para arrancar. Puedes ocultar esta guía con la flecha de arriba.
          </p>
        </div>
      )}
    </Card>
  );
}
