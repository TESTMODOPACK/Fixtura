import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Gavel,
  Globe,
  Megaphone,
  ShieldCheck,
  Smartphone,
  UserCog,
  Users,
  Wallet,
  WifiOff,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { LigaPlusLockup, LigaPlusMark } from '@/components/ui/logo';

const CONTACTO_EMAIL = 'hola@ligaplus.cl';
const MAILTO_DEMO = `mailto:${CONTACTO_EMAIL}?subject=${encodeURIComponent(
  'Quiero una demo de LigaPlus para mi liga',
)}`;

const FUNCIONES = [
  {
    icon: CalendarDays,
    label: '01 · Competencia',
    titulo: 'FIXTURE AUTOMÁTICO',
    texto:
      'Generador con tabla de Berger, horarios y canchas por torneo, feriados chilenos precargados y reprogramación arrastrando partidos entre fechas.',
  },
  {
    icon: ClipboardList,
    label: '02 · En cancha',
    titulo: 'ACTA DIGITAL EN VIVO',
    texto:
      'Goles, tarjetas y cambios desde el celular del planillero, con cronómetro y marcador en tiempo real. Funciona sin señal: el acta se sincroniza al volver la conexión.',
  },
  {
    icon: UserCog,
    label: '03 · Arbitraje',
    titulo: 'DESIGNACIONES SIN CHOQUES',
    texto:
      'Asignación automática de árbitros y planilleros con detección de dobles designaciones, ausencias y disponibilidad. Cada árbitro confirma desde su correo.',
  },
  {
    icon: Banknote,
    label: '04 · Finanzas',
    titulo: 'COBROS Y PAGO ONLINE',
    texto:
      'Matrículas, cuotas y multas por club, pago con Webpay, boleta electrónica SII y recordatorios automáticos a los morosos.',
  },
  {
    icon: Wallet,
    label: '05 · Personal',
    titulo: 'HONORARIOS Y NÓMINAS',
    texto:
      'Cada partido dirigido genera el devengo del árbitro. A fin de mes liquidás todo en una nómina con archivo para transferencia bancaria masiva.',
  },
  {
    icon: Gavel,
    label: '06 · Disciplina',
    titulo: 'TRIBUNAL Y SANCIONES',
    texto:
      'Tarjetas acumuladas, expulsiones y castigos del tribunal se descuentan solos fecha a fecha. El acta avisa si un sancionado intenta jugar.',
  },
  {
    icon: Globe,
    label: '07 · Comunidad',
    titulo: 'PORTAL PÚBLICO PROPIO',
    texto:
      'Tu liga vive en su propio dominio con tabla de posiciones, goleadores, fixture y resultados al instante. Tu marca, tus sponsors, tu portada.',
  },
  {
    icon: Users,
    label: '08 · Clubes',
    titulo: 'PORTAL DEL DELEGADO',
    texto:
      'Cada club gestiona su plantel, ve sus partidos y paga sus deudas online. Importación de planteles desde Excel con validación de RUT.',
  },
] as const;

const PASOS = [
  {
    n: '1',
    titulo: 'Configuramos tu liga',
    texto:
      'Creamos tu portal con tu dominio, escudo y colores. Definís categorías, series, canchas y tarifas. Te acompañamos en la puesta en marcha.',
  },
  {
    n: '2',
    titulo: 'Cargás clubes y planteles',
    texto:
      'Los clubes se inscriben con sus planteles — desde Excel o invitando a cada delegado a cargar el suyo. RUT validado, sin jugadores duplicados.',
  },
  {
    n: '3',
    titulo: 'Generás el fixture y a jugar',
    texto:
      'Un click genera el calendario completo. Desde ahí: actas en cancha, tabla al instante, cobros y designaciones corriendo solos.',
  },
] as const;

const ROLES = [
  {
    titulo: 'Administrador de liga',
    texto: 'Panel completo: torneos, fixture, finanzas, tribunal, personal y auditoría.',
  },
  {
    titulo: 'Delegado de club',
    texto: 'Su plantel, sus partidos, sus pagos. Sin llamarte por teléfono.',
  },
  {
    titulo: 'Árbitro y planillero',
    texto: 'Designaciones por correo, acta digital en cancha y sus liquidaciones claras.',
  },
  {
    titulo: 'Jugador e hincha',
    texto: 'Tabla, goleadores, fixture y resultados en vivo desde el portal público.',
  },
] as const;

/**
 * Home pública del SaaS LigaPlus — se renderiza cuando el hostname es
 * ligaplus.cl. Target: dirigentes de ligas amateur que quieren dejar
 * el Excel y el cuaderno. Server component puro: sin fetch, SEO completo.
 */
export function MarketingHome(): React.ReactElement {
  return (
    <main className="min-h-screen bg-paper">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-line bg-chalk/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <LigaPlusLockup showTag={false} />
          <nav className="hidden md:flex items-center gap-6 text-sm text-ink-mute">
            <a href="#funciones" className="hover:text-green-deep">
              Funciones
            </a>
            <a href="#como-funciona" className="hover:text-green-deep">
              Cómo funciona
            </a>
            <a href="#roles" className="hover:text-green-deep">
              Para quién
            </a>
            <a href="#contacto" className="hover:text-green-deep">
              Contacto
            </a>
          </nav>
          <a href={MAILTO_DEMO}>
            <Button variant="accent" size="sm">
              Solicitar demo
            </Button>
          </a>
        </div>
      </header>

      {/* ─── Hero ───────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <div className="eyebrow mb-3">→ Para ligas de fútbol amateur · Chile</div>
          <h1 className="font-display_alt text-5xl md:text-7xl leading-none tracking-tight text-green-deep">
            La cancha,
            <br />
            organizada.
          </h1>
          <p className="font-serif italic text-xl text-ink-mute mt-6 leading-relaxed">
            Fixture, actas, árbitros, cobros y tabla de posiciones — todo en una sola
            plataforma, con el portal de tu liga en su propio dominio.
            <br />
            Cero planillas Excel. Cero cuaderno.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={MAILTO_DEMO}>
              <Button variant="accent">Solicitar una demo →</Button>
            </a>
            <a href="#funciones">
              <Button variant="default">Ver funciones</Button>
            </a>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-mute">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-success" /> 30 días de prueba
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-success" /> Sin permanencia
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-success" /> Te ayudamos a migrar tus datos
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center">
          <Card variant="dark" padding="roomy" className="w-full max-w-sm text-center">
            <LigaPlusMark size={180} className="mx-auto" />
            <CardLabel tone="lime" className="mt-6 justify-center">
              El centro del juego
            </CardLabel>
            <p className="font-serif italic text-green-lime text-sm leading-relaxed">
              Donde dos equipos se cruzan, el calendario se tacha y el deporte ocurre.
              LigaPlus pone orden alrededor.
            </p>
          </Card>
        </div>
      </section>

      {/* ─── Banda: hecho para Chile ────────────────────────────── */}
      <section className="bg-green-deep text-chalk">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="eyebrow-lime">→ Hecho para el fútbol amateur chileno</div>
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-chalk/80">
            <span>RUT validado</span>
            <span>Pago con Webpay</span>
            <span>Boleta electrónica SII</span>
            <span>Feriados de Chile en el fixture</span>
          </div>
        </div>
      </section>

      {/* ─── Funciones ──────────────────────────────────────────── */}
      <section id="funciones" className="bg-chalk border-b border-line scroll-mt-16">
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-20">
          <div className="eyebrow mb-3">→ Funciones</div>
          <h2 className="font-display text-4xl md:text-5xl text-green-deep tracking-display mb-10">
            TODO LO QUE HOY HACÉS A MANO
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FUNCIONES.map((f) => {
              const Icon = f.icon;
              return (
                <Card key={f.titulo} className="flex flex-col">
                  <Icon size={22} className="text-accent mb-3" />
                  <CardLabel>{f.label}</CardLabel>
                  <h3 className="font-display text-xl text-green-deep tracking-display mb-2">
                    {f.titulo}
                  </h3>
                  <p className="text-sm text-ink-mute leading-relaxed">{f.texto}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Cómo funciona ──────────────────────────────────────── */}
      <section id="como-funciona" className="max-w-6xl mx-auto px-6 py-16 md:py-20 scroll-mt-16">
        <div className="eyebrow mb-3">→ Cómo funciona</div>
        <h2 className="font-display text-4xl md:text-5xl text-green-deep tracking-display mb-10">
          EN MARCHA EN UNA SEMANA
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {PASOS.map((p) => (
            <Card key={p.n} variant="paper" className="relative overflow-hidden">
              <div
                aria-hidden="true"
                className="font-display_alt text-[110px] leading-none text-green-deep/10 absolute -top-4 right-2 select-none"
              >
                {p.n}
              </div>
              <h3 className="font-display text-2xl text-green-deep tracking-display mb-2 relative">
                {p.titulo}
              </h3>
              <p className="text-sm text-ink-mute leading-relaxed relative">{p.texto}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ─── PWA / offline ──────────────────────────────────────── */}
      <section className="bg-green-deep text-chalk">
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-20 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="eyebrow-lime mb-3">→ Pensado para la cancha, no para la oficina</div>
            <h2 className="font-display text-4xl md:text-5xl tracking-display mb-4">
              FUNCIONA DONDE NO HAY SEÑAL
            </h2>
            <p className="font-serif italic text-green-lime leading-relaxed">
              La app se instala en cualquier celular como una aplicación nativa. El planillero
              levanta el acta en una cancha sin cobertura y todo se sincroniza solo cuando
              vuelve la conexión. Los hinchas reciben el resultado por notificación.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-card border border-green-mid p-5 text-center">
              <Smartphone size={26} className="mx-auto mb-3 text-green-lime" />
              <div className="text-sm font-semibold">Instalable</div>
              <div className="text-xs text-chalk/70 mt-1">Android y iPhone, sin app store</div>
            </div>
            <div className="rounded-card border border-green-mid p-5 text-center">
              <WifiOff size={26} className="mx-auto mb-3 text-green-lime" />
              <div className="text-sm font-semibold">Offline</div>
              <div className="text-xs text-chalk/70 mt-1">El acta no se pierde nunca</div>
            </div>
            <div className="rounded-card border border-green-mid p-5 text-center">
              <Megaphone size={26} className="mx-auto mb-3 text-green-lime" />
              <div className="text-sm font-semibold">Notificaciones</div>
              <div className="text-xs text-chalk/70 mt-1">Resultados push al hincha</div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Roles ──────────────────────────────────────────────── */}
      <section id="roles" className="max-w-6xl mx-auto px-6 py-16 md:py-20 scroll-mt-16">
        <div className="eyebrow mb-3">→ Para quién</div>
        <h2 className="font-display text-4xl md:text-5xl text-green-deep tracking-display mb-10">
          CADA UNO VE LO SUYO
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {ROLES.map((r) => (
            <Card key={r.titulo}>
              <ShieldCheck size={20} className="text-accent mb-3" />
              <h3 className="font-semibold text-green-deep mb-1">{r.titulo}</h3>
              <p className="text-sm text-ink-mute leading-relaxed">{r.texto}</p>
            </Card>
          ))}
        </div>
        <p className="text-xs text-ink-mute mt-6">
          Cada perfil entra con su propia cuenta y solo ve la información de su liga — los
          datos de cada liga están aislados a nivel de base de datos.
        </p>
      </section>

      {/* ─── Precios / CTA final ────────────────────────────────── */}
      <section id="contacto" className="bg-chalk border-t border-line scroll-mt-16">
        <div className="max-w-3xl mx-auto px-6 py-16 md:py-20 text-center">
          <div className="eyebrow mb-3 justify-center">→ Empezá hoy</div>
          <h2 className="font-display text-4xl md:text-5xl text-green-deep tracking-display mb-4">
            PROBALO 30 DÍAS EN TU LIGA
          </h2>
          <p className="font-serif italic text-ink-mute leading-relaxed mb-8">
            Plan mensual según el tamaño de tu liga, sin permanencia ni costos de
            instalación. Escribinos y te armamos una demo con datos reales de tu
            competencia.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a href={MAILTO_DEMO}>
              <Button variant="accent">Escribir a {CONTACTO_EMAIL} →</Button>
            </a>
          </div>
          <p className="text-xs text-ink-mute mt-4">Respondemos dentro de 1 día hábil.</p>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────────────────────── */}
      <footer className="bg-green-deep text-chalk">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <LigaPlusLockup inverse />
            <div className="flex flex-col md:items-end gap-1 text-center md:text-right">
              <a
                href={`mailto:${CONTACTO_EMAIL}`}
                className="text-sm text-green-lime hover:text-chalk"
              >
                {CONTACTO_EMAIL}
              </a>
              <div className="text-xs text-chalk/60 uppercase tracking-widest">
                © 2026 LigaPlus · Chile
              </div>
            </div>
          </div>
          <p className="mt-6 text-[11px] text-chalk/50 text-center md:text-left">
            ¿Tu liga ya usa LigaPlus? Ingresá desde el dominio propio de tu liga — ahí está tu
            portal con el acceso de administradores, delegados y árbitros.
          </p>
        </div>
      </footer>
    </main>
  );
}
