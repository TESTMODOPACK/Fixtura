import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { LigaPlusLockup, LigaPlusMark } from '@/components/ui/logo';

/**
 * Home pública del SaaS LigaPlus — se renderiza cuando el hostname es
 * fixtura.cl (o IP/localhost en dev). Target: dueños de ligas que
 * quieren contratar el producto.
 */
export function MarketingHome(): React.ReactElement {
  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-line bg-chalk">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <LigaPlusLockup showTag={false} />
          <div className="flex items-center gap-2">
            <Link href="/precios">
              <Button variant="ghost" size="sm">
                Precios
              </Button>
            </Link>
            <Link href="/registro">
              <Button variant="accent" size="sm">
                Crear mi liga
              </Button>
            </Link>
          </div>
        </div>
      </header>

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
            Tu propio sitio web. Cero planillas Excel.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/registro">
              <Button variant="accent">Crear mi liga →</Button>
            </Link>
            <a href="mailto:hola@fixtura.cl">
              <Button variant="default">Hablar con ventas</Button>
            </a>
          </div>
        </div>

        <div className="flex items-center justify-center">
          <Card variant="dark" padding="roomy" className="w-full max-w-sm text-center">
            <LigaPlusMark size={200} className="mx-auto" />
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
            <CardLabel>03 · Tu dominio propio</CardLabel>
            <h3 className="font-display text-2xl text-green-deep tracking-display mb-2">
              MARCA + COMUNIDAD
            </h3>
            <p className="text-sm text-ink-mute leading-relaxed">
              Tu liga vive en su propio dominio (liganunoa.cl, ligaviña.cl). Hinchas, jugadores
              y prensa entran al portal con la marca de la liga, no la de LigaPlus.
            </p>
          </Card>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <div className="eyebrow mb-3 justify-center">→ ¿Ya tenés liga en LigaPlus?</div>
        <h2 className="font-display text-4xl md:text-5xl text-green-deep tracking-display mb-3">
          ENTRÁ A TU PORTAL
        </h2>
        <p className="font-serif italic text-ink-mute mb-8 max-w-2xl mx-auto">
          Cada liga tiene su propio dominio (ej. liganunoa.cl). Si sos admin, delegado o árbitro,
          ingresá directamente desde el dominio de tu liga.
        </p>
      </section>

      <footer className="bg-green-deep text-chalk">
        <div className="max-w-6xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between gap-4">
          <LigaPlusLockup inverse />
          <div className="text-xs text-green-lime uppercase tracking-widest">
            © 2026 LigaPlus
          </div>
        </div>
      </footer>
    </main>
  );
}
