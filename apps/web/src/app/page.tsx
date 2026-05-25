import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { FixturaLockup, FixturaMark } from '@/components/ui/logo';

export default function HomePage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-paper">
      {/* Header */}
      <header className="border-b border-line bg-chalk">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <FixturaLockup showTag={false} />
          <Link href="/login">
            <Button variant="accent" size="sm">
              Iniciar sesión
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-20 md:py-28 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <div className="eyebrow mb-3">→ Para ligas amateur · Chile</div>
          <h1 className="font-display_alt text-6xl md:text-7xl leading-none tracking-tight text-green-deep">
            La cancha,
            <br />
            organizada.
          </h1>
          <p className="font-serif italic text-xl text-ink-mute mt-6 leading-relaxed">
            Torneos, fixture, designaciones, finanzas y comunidad.
            <br />
            Una sola plataforma. Cero planillas Excel.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login">
              <Button variant="accent">Empezar →</Button>
            </Link>
            <Button variant="default">Ver demo</Button>
          </div>
        </div>

        <div className="flex items-center justify-center">
          <Card variant="dark" padding="roomy" className="w-full max-w-sm text-center">
            <FixturaMark size={200} className="mx-auto" />
            <CardLabel tone="lime" className="mt-6 justify-center">
              El centro del juego
            </CardLabel>
            <p className="font-serif italic text-green-lime text-sm leading-relaxed">
              La X es donde dos partidos se cruzan, dos equipos se enfrentan, el calendario
              se tacha. Donde el deporte ocurre.
            </p>
          </Card>
        </div>
      </section>

      {/* Tres bloques */}
      <section className="bg-chalk border-y border-line">
        <div className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-3 gap-6">
          <Card>
            <CardLabel>01 · Competencia</CardLabel>
            <h3 className="font-display text-2xl text-green-deep tracking-display mb-2">
              FIXTURE Y ACTAS
            </h3>
            <p className="text-sm text-ink-mute leading-relaxed">
              Generador automático con tabla de Berger, reprogramación con un click, acta
              digital en vivo offline desde cualquier celular en cancha.
            </p>
          </Card>
          <Card>
            <CardLabel>02 · Operación</CardLabel>
            <h3 className="font-display text-2xl text-green-deep tracking-display mb-2">
              DESIGNAR Y LIQUIDAR
            </h3>
            <p className="text-sm text-ink-mute leading-relaxed">
              Asigna árbitros y planilleros con detección automática de conflictos. Liquida
              honorarios a fin de mes con transferencia bancaria masiva.
            </p>
          </Card>
          <Card>
            <CardLabel>03 · Comunidad</CardLabel>
            <h3 className="font-display text-2xl text-green-deep tracking-display mb-2">
              PERFIL Y RANKING
            </h3>
            <p className="text-sm text-ink-mute leading-relaxed">
              Cada jugador tiene su tarjeta tipo FUT con ratings, estadísticas e
              insignias. Los hinchas siguen a su club desde el portal público.
            </p>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-green-deep text-chalk">
        <div className="max-w-6xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between gap-4">
          <FixturaLockup inverse />
          <div className="text-xs text-green-lime uppercase tracking-widest">
            © 2026 Fixtura
          </div>
        </div>
      </footer>
    </main>
  );
}
