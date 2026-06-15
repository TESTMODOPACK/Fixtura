import {
  ArrowRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Gavel,
  Globe,
  Mail,
  Megaphone,
  ShieldCheck,
  Smartphone,
  Timer,
  UserCog,
  Users,
  Wallet,
  WifiOff,
} from 'lucide-react';

import { MarketingLoginButton } from '@/components/marketing-login-button';
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
    titulo: 'Fixture automático',
    texto:
      'Calendario completo en un click: tabla de Berger, horarios y canchas por torneo, feriados chilenos y reprogramación arrastrando partidos.',
  },
  {
    icon: ClipboardList,
    titulo: 'Acta digital en vivo',
    texto:
      'Goles, tarjetas y cambios desde el celular en cancha, con cronómetro y marcador en tiempo real. Funciona sin señal.',
  },
  {
    icon: UserCog,
    titulo: 'Designaciones de árbitros',
    texto:
      'Asignación automática con detección de choques de horario, ausencias y disponibilidad. Cada árbitro confirma desde su correo.',
  },
  {
    icon: Banknote,
    titulo: 'Cobros y pago online',
    texto:
      'Matrículas, cuotas y multas por club. Pago con Webpay, boleta electrónica SII y recordatorios automáticos a morosos.',
  },
  {
    icon: Wallet,
    titulo: 'Honorarios y nóminas',
    texto:
      'Cada partido dirigido genera el devengo del árbitro. A fin de mes, una nómina con archivo para transferencia bancaria masiva.',
  },
  {
    icon: Gavel,
    titulo: 'Tribunal y sanciones',
    texto:
      'Tarjetas acumuladas y castigos se descuentan solos fecha a fecha. El acta avisa si un sancionado intenta jugar.',
  },
  {
    icon: Globe,
    titulo: 'Portal público propio',
    texto:
      'Tu liga en su propio dominio: tabla, goleadores, fixture y resultados al instante. Tu marca y tus sponsors, no los nuestros.',
  },
  {
    icon: Users,
    titulo: 'Portal del delegado',
    texto:
      'Cada club gestiona su plantel, ve sus partidos y paga online. Importación desde Excel con RUT validado.',
  },
] as const;

const PASOS = [
  {
    n: '01',
    titulo: 'Configuramos tu liga',
    texto:
      'Creamos tu portal con tu dominio, escudo y colores. Defines categorías, series, canchas y tarifas. Te acompañamos en toda la puesta en marcha.',
  },
  {
    n: '02',
    titulo: 'Cargas clubes y planteles',
    texto:
      'Los clubes se inscriben con sus planteles — desde Excel o invitando a cada delegado a cargar el suyo. RUT validado, sin duplicados.',
  },
  {
    n: '03',
    titulo: 'Generas el fixture y a jugar',
    texto:
      'Un click genera el calendario completo. Desde ahí: actas en cancha, tabla al instante, cobros y designaciones corriendo solos.',
  },
] as const;

const ROLES = [
  {
    icon: ShieldCheck,
    titulo: 'Administrador de liga',
    texto: 'Panel completo: torneos, fixture, finanzas, tribunal, personal y auditoría de cada acción.',
  },
  {
    icon: Users,
    titulo: 'Delegado de club',
    texto: 'Su plantel, sus partidos, sus pagos pendientes. Sin llamarte por teléfono.',
  },
  {
    icon: UserCog,
    titulo: 'Árbitro y planillero',
    texto: 'Designaciones por correo, acta digital en cancha y liquidaciones claras a fin de mes.',
  },
  {
    icon: Megaphone,
    titulo: 'Jugador e hincha',
    texto: 'Tabla, goleadores, fixture y resultados en vivo desde el portal público de su liga.',
  },
] as const;

const FAQ = [
  {
    q: '¿Cuánto demora la puesta en marcha?',
    a: 'Una semana, típicamente. Configuramos tu portal y dominio, cargamos los clubes desde tus planillas actuales y dejamos el primer torneo listo para generar fixture. Te acompañamos en las primeras fechas.',
  },
  {
    q: '¿Necesito conocimientos técnicos?',
    a: 'No. Si manejas WhatsApp y una planilla, manejas LigaPlus. La carga masiva es desde Excel con plantillas descargables, y cada pantalla guía el paso siguiente.',
  },
  {
    q: '¿Qué pasa con los datos de mi liga?',
    a: 'Son tuyos. Cada liga vive aislada a nivel de base de datos, con respaldos diarios. Si algún día te vas, te entregamos toda tu información en formatos estándar.',
  },
  {
    q: '¿Sirve para canchas sin señal?',
    a: 'Sí — es uno de los pilares del producto. El acta funciona offline en el celular del planillero y se sincroniza sola cuando vuelve la conexión. No se pierde nada.',
  },
  {
    q: '¿Cómo se cobra?',
    a: 'Suscripción mensual según el tamaño de tu liga, sin permanencia ni costo de instalación. Los primeros 30 días son de prueba. El pago de los clubes a la liga (cuotas, multas) va directo a la cuenta de la liga vía Webpay.',
  },
  {
    q: '¿Mi liga tiene su propia página?',
    a: 'Sí. Cada liga vive en su propio dominio (por ejemplo lligatuciudad.cl) con su escudo, colores y sponsors. La marca visible es la de tu liga, no la nuestra.',
  },
] as const;

/* ─── Mockups del producto (HTML/CSS puro, sin screenshots) ─────────── */

function MockupTabla(): React.ReactElement {
  const filas = [
    { pos: 1, club: 'Dep. Los Aromos', pj: 14, dg: '+19', pts: 34 },
    { pos: 2, club: 'Unión Maipú', pj: 14, dg: '+15', pts: 31 },
    { pos: 3, club: 'Atlético Cordillera', pj: 14, dg: '+8', pts: 27 },
    { pos: 4, club: 'Real San Joaquín', pj: 14, dg: '+2', pts: 22 },
    { pos: 5, club: 'Estrella del Sur', pj: 14, dg: '-4', pts: 18 },
  ];
  return (
    <div className="rounded-xl border border-line bg-chalk shadow-elev overflow-hidden">
      {/* barra de navegador */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 bg-paper-dark/60 border-b border-line">
        <span className="w-2.5 h-2.5 rounded-full bg-danger/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-accent/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-success/70" />
        <span className="ml-3 text-[10px] text-ink-mute bg-chalk rounded px-2 py-0.5 border border-line">
          ligasantarosa.cl/tabla
        </span>
      </div>
      <div className="p-4">
        <div className="eyebrow mb-2">→ Clausura 2026 · Primera</div>
        <div className="font-display text-xl text-green-deep tracking-display mb-3">
          TABLA DE POSICIONES
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-ink-mute text-left">
              <th className="py-1 font-medium w-6">#</th>
              <th className="py-1 font-medium">Club</th>
              <th className="py-1 font-medium text-right">PJ</th>
              <th className="py-1 font-medium text-right">DG</th>
              <th className="py-1 font-medium text-right">PTS</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.pos} className="border-t border-line/60">
                <td className="py-1.5 text-ink-mute">{f.pos}</td>
                <td className="py-1.5 font-medium text-green-deep">{f.club}</td>
                <td className="py-1.5 text-right text-ink-mute">{f.pj}</td>
                <td className="py-1.5 text-right text-ink-mute">{f.dg}</td>
                <td className="py-1.5 text-right font-mono font-semibold text-green-deep">
                  {f.pts}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MockupActa(): React.ReactElement {
  return (
    <div className="w-[260px] rounded-[2rem] border-[6px] border-green-deep bg-chalk shadow-elev overflow-hidden">
      <div className="bg-green-deep text-chalk px-4 pt-3 pb-4 text-center">
        <div className="eyebrow-lime mb-1 justify-center text-[9px]">→ Fecha 7 · Cancha 2</div>
        <div className="flex items-center justify-center gap-3 font-display text-2xl tracking-display">
          <span>LOS AROMOS</span>
          <span className="font-display_alt text-3xl">2–1</span>
          <span>U. MAIPÚ</span>
        </div>
        <div className="mt-2 inline-flex items-center gap-1.5 text-green-lime text-xs font-mono">
          <Timer size={12} /> 67:12 · 2º tiempo
        </div>
      </div>
      <div className="p-3 space-y-2 text-[11px]">
        {[
          { min: "23'", evento: 'Gol · R. Soto (LA)', tone: 'text-success' },
          { min: "41'", evento: 'Amarilla · J. Pérez (UM)', tone: 'text-warning' },
          { min: "58'", evento: 'Gol · M. Fuentes (UM)', tone: 'text-success' },
          { min: "64'", evento: 'Gol · R. Soto (LA)', tone: 'text-success' },
        ].map((e) => (
          <div
            key={`${e.min}-${e.evento}`}
            className="flex items-center gap-2 rounded-card border border-line bg-paper px-2.5 py-1.5"
          >
            <span className="font-mono text-ink-mute w-7">{e.min}</span>
            <span className={`font-medium ${e.tone}`}>{e.evento}</span>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-card bg-accent text-chalk text-center py-2 font-semibold">
            + Gol
          </div>
          <div className="rounded-card bg-green-deep text-chalk text-center py-2 font-semibold">
            + Tarjeta
          </div>
        </div>
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-ink-mute pt-1">
          <WifiOff size={11} /> Sin conexión — se sincroniza al volver la señal
        </div>
      </div>
    </div>
  );
}

function MockupCobros(): React.ReactElement {
  const filas = [
    { club: 'Dep. Los Aromos', concepto: 'Cuota junio', monto: '$45.000', estado: 'Pagada', tone: 'bg-success/15 text-success' },
    { club: 'Unión Maipú', concepto: 'Cuota junio', monto: '$45.000', estado: 'Pagada', tone: 'bg-success/15 text-success' },
    { club: 'Atlético Cordillera', concepto: 'Multa W.O.', monto: '$30.000', estado: 'Pendiente', tone: 'bg-warning/15 text-warning' },
    { club: 'Real San Joaquín', concepto: 'Cuota junio', monto: '$45.000', estado: 'Vencida', tone: 'bg-danger/15 text-danger' },
  ];
  return (
    <div className="rounded-xl border border-line bg-chalk shadow-elev overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <div>
          <div className="eyebrow text-[9px]">→ Finanzas · Junio 2026</div>
          <div className="font-display text-lg text-green-deep tracking-display">COBROS A CLUBES</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-ink-mute">Recaudado</div>
          <div className="font-mono font-bold text-green-deep">$1.240.000</div>
        </div>
      </div>
      <div className="divide-y divide-line/60 text-xs">
        {filas.map((f) => (
          <div key={`${f.club}-${f.concepto}`} className="flex items-center gap-2 px-4 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-green-deep truncate">{f.club}</div>
              <div className="text-ink-mute">{f.concepto}</div>
            </div>
            <div className="font-mono text-ink">{f.monto}</div>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${f.tone}`}>
              {f.estado}
            </span>
          </div>
        ))}
      </div>
      <div className="px-4 py-2.5 bg-paper border-t border-line text-[10px] text-ink-mute">
        Recordatorio automático enviado a 2 clubes con deuda · Pago online vía Webpay
      </div>
    </div>
  );
}

/**
 * Home pública del SaaS LigaPlus — se renderiza cuando el hostname es
 * ligaplus.cl. Target: dirigentes de ligas amateur que quieren dejar
 * el Excel y el cuaderno. Server component puro: sin fetch, SEO completo.
 * Los mockups de producto son HTML/CSS (no screenshots) para que se vean
 * nítidos en cualquier resolución y no expongan datos reales de ligas.
 */
export function MarketingHome(): React.ReactElement {
  return (
    <main className="min-h-screen bg-paper">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-line bg-chalk/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <LigaPlusLockup showTag={false} />
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-ink-mute">
            <a href="#funciones" className="hover:text-green-deep transition-colors">
              Funciones
            </a>
            <a href="#producto" className="hover:text-green-deep transition-colors">
              El producto
            </a>
            <a href="#como-funciona" className="hover:text-green-deep transition-colors">
              Cómo funciona
            </a>
            <a href="#faq" className="hover:text-green-deep transition-colors">
              Preguntas
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <MarketingLoginButton />
            <a href={MAILTO_DEMO}>
              <Button variant="accent" size="sm">
                Solicitar demo
              </Button>
            </a>
          </div>
        </div>
      </header>

      {/* ─── Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 pt-16 pb-20 md:pt-24 md:pb-28 grid lg:grid-cols-[1.1fr_1fr] gap-14 items-center">
          <div>
            <div className="eyebrow mb-4">→ Plataforma para ligas de fútbol amateur · Chile</div>
            <h1 className="font-display_alt text-5xl md:text-7xl leading-[0.95] tracking-tight text-green-deep">
              La cancha,
              <br />
              organizada.
            </h1>
            <p className="font-serif italic text-xl text-ink-mute mt-6 leading-relaxed max-w-lg">
              Fixture, actas, árbitros, cobros y tabla de posiciones en una sola plataforma —
              con el portal de tu liga en su propio dominio. Cero planillas. Cero cuaderno.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={MAILTO_DEMO}>
                <Button variant="accent">
                  Solicitar una demo <ArrowRight size={15} className="inline ml-1 -mt-0.5" />
                </Button>
              </a>
              <a href="#producto">
                <Button variant="default">Ver el producto</Button>
              </a>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-mute">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-success" /> 30 días de prueba
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-success" /> Sin permanencia
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-success" /> Migramos tus datos
              </span>
            </div>
          </div>

          {/* Mockup compuesto: tabla + acta superpuesta */}
          <div className="relative hidden sm:block">
            <div className="lg:pr-24">
              <MockupTabla />
            </div>
            <div className="absolute -bottom-10 right-0 hidden lg:block scale-90 origin-bottom-right">
              <MockupActa />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Banda: hecho para Chile ────────────────────────────── */}
      <section className="bg-green-deep text-chalk">
        <div className="max-w-6xl mx-auto px-6 py-7 flex flex-col md:flex-row items-center justify-between gap-4">
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
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-24">
          <div className="max-w-2xl mb-12">
            <div className="eyebrow mb-3">→ Funciones</div>
            <h2 className="font-display text-4xl md:text-5xl text-green-deep tracking-display mb-4">
              TODO LO QUE HOY HACES A MANO
            </h2>
            <p className="font-serif italic text-ink-mute leading-relaxed">
              Cada módulo nació de cómo se administra una liga de verdad: el fixture en la
              pizarra, el acta en papel, las cuotas en un cuaderno. LigaPlus lo conecta todo.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FUNCIONES.map((f, i) => {
              const Icon = f.icon;
              return (
                <Card key={f.titulo} className="flex flex-col hover:shadow-elev transition-shadow">
                  <div className="w-10 h-10 rounded-card bg-green-deep flex items-center justify-center mb-4">
                    <Icon size={18} className="text-green-lime" />
                  </div>
                  <CardLabel>{String(i + 1).padStart(2, '0')}</CardLabel>
                  <h3 className="font-semibold text-green-deep mb-1.5">{f.titulo}</h3>
                  <p className="text-sm text-ink-mute leading-relaxed">{f.texto}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── El producto en profundidad ─────────────────────────── */}
      <section id="producto" className="max-w-6xl mx-auto px-6 py-16 md:py-24 scroll-mt-16 space-y-20">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="eyebrow mb-3">→ El portal de tu liga</div>
            <h2 className="font-display text-3xl md:text-4xl text-green-deep tracking-display mb-4">
              LA TABLA, AL SEGUNDO DEL PITAZO FINAL
            </h2>
            <p className="text-ink-mute leading-relaxed mb-5">
              Apenas el planillero cierra el acta, la tabla de posiciones, los goleadores y los
              resultados se publican solos en el portal de tu liga. Los hinchas dejan de
              preguntar por WhatsApp — entran a la página de su liga, con su dominio y su
              escudo.
            </p>
            <ul className="space-y-2.5 text-sm text-ink">
              {[
                'Tabla, goleadores, MVP y asistencias por torneo y categoría',
                'Resultados en vivo con marcador minuto a minuto',
                'Tu dominio, tu escudo, tus colores y tus sponsors',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <CheckCircle2 size={16} className="text-success mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <MockupTabla />
        </div>

        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="flex justify-center md:order-1 order-2">
            <MockupActa />
          </div>
          <div className="md:order-2 order-1">
            <div className="eyebrow mb-3">→ En la cancha</div>
            <h2 className="font-display text-3xl md:text-4xl text-green-deep tracking-display mb-4">
              EL ACTA SE LEVANTA CON UN DEDO
            </h2>
            <p className="text-ink-mute leading-relaxed mb-5">
              El planillero registra goles, tarjetas y cambios desde su celular, con cronómetro
              corriendo. Si la cancha no tiene señal, no importa: el acta funciona offline y se
              sincroniza sola al volver la conexión. Las sanciones se calculan automáticamente
              al cerrar.
            </p>
            <ul className="space-y-2.5 text-sm text-ink">
              {[
                'Cronómetro y marcador en tiempo real, visible para los hinchas',
                'Alerta si un jugador sancionado o no inscrito intenta jugar',
                'Tarjetas y suspensiones pasan directo al tribunal de disciplina',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <CheckCircle2 size={16} className="text-success mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="eyebrow mb-3">→ Las platas claras</div>
            <h2 className="font-display text-3xl md:text-4xl text-green-deep tracking-display mb-4">
              QUIÉN PAGÓ Y QUIÉN DEBE, SIN PERSEGUIR A NADIE
            </h2>
            <p className="text-ink-mute leading-relaxed mb-5">
              Matrículas, cuotas y multas se generan solas según el tarifario de cada torneo.
              Los clubes pagan online con Webpay y la boleta SII se emite automática. A los
              morosos les llega el recordatorio sin que levantes el teléfono.
            </p>
            <ul className="space-y-2.5 text-sm text-ink">
              {[
                'Cuotas recurrentes y multas automáticas por walkover o tarjetas',
                'Pago online del delegado desde su portal — directo a la cuenta de la liga',
                'Honorarios de árbitros liquidados en nómina con archivo bancario',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <CheckCircle2 size={16} className="text-success mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <MockupCobros />
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
              La app se instala en cualquier celular como una aplicación nativa — sin pasar
              por la app store. El acta no se pierde nunca y los hinchas reciben el resultado
              por notificación apenas termina el partido.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: Smartphone, t: 'Instalable', d: 'Android y iPhone, sin app store' },
              { icon: WifiOff, t: 'Offline', d: 'El acta no se pierde nunca' },
              { icon: Megaphone, t: 'Notificaciones', d: 'Resultados push al hincha' },
            ].map((x) => {
              const Icon = x.icon;
              return (
                <div key={x.t} className="rounded-card border border-green-mid p-5 text-center">
                  <Icon size={26} className="mx-auto mb-3 text-green-lime" />
                  <div className="text-sm font-semibold">{x.t}</div>
                  <div className="text-xs text-chalk/70 mt-1">{x.d}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Cómo funciona ──────────────────────────────────────── */}
      <section id="como-funciona" className="max-w-6xl mx-auto px-6 py-16 md:py-24 scroll-mt-16">
        <div className="max-w-2xl mb-12">
          <div className="eyebrow mb-3">→ Cómo funciona</div>
          <h2 className="font-display text-4xl md:text-5xl text-green-deep tracking-display mb-4">
            EN MARCHA EN UNA SEMANA
          </h2>
          <p className="font-serif italic text-ink-mute leading-relaxed">
            No vendemos un software y desaparecemos: te acompañamos hasta que la primera
            fecha corre completa en LigaPlus.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {PASOS.map((p) => (
            <Card key={p.n} variant="paper" className="relative overflow-hidden">
              <div
                aria-hidden="true"
                className="font-display_alt text-[100px] leading-none text-green-deep/10 absolute -top-3 right-3 select-none"
              >
                {p.n}
              </div>
              <h3 className="font-display text-2xl text-green-deep tracking-display mb-2 relative max-w-[80%]">
                {p.titulo}
              </h3>
              <p className="text-sm text-ink-mute leading-relaxed relative">{p.texto}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ─── Roles ──────────────────────────────────────────────── */}
      <section className="bg-chalk border-y border-line">
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-20">
          <div className="eyebrow mb-3">→ Para quién</div>
          <h2 className="font-display text-4xl md:text-5xl text-green-deep tracking-display mb-10">
            CADA UNO VE LO SUYO
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {ROLES.map((r) => {
              const Icon = r.icon;
              return (
                <Card key={r.titulo}>
                  <Icon size={20} className="text-accent mb-3" />
                  <h3 className="font-semibold text-green-deep mb-1">{r.titulo}</h3>
                  <p className="text-sm text-ink-mute leading-relaxed">{r.texto}</p>
                </Card>
              );
            })}
          </div>
          <p className="text-xs text-ink-mute mt-6 max-w-2xl">
            Cada perfil entra con su propia cuenta y solo ve la información de su liga: los
            datos de cada liga están aislados a nivel de base de datos, con auditoría de cada
            acción crítica.
          </p>
        </div>
      </section>

      {/* ─── FAQ ────────────────────────────────────────────────── */}
      <section id="faq" className="max-w-3xl mx-auto px-6 py-16 md:py-24 scroll-mt-16">
        <div className="text-center mb-10">
          <div className="eyebrow mb-3 justify-center">→ Preguntas frecuentes</div>
          <h2 className="font-display text-4xl md:text-5xl text-green-deep tracking-display">
            LO QUE TODOS PREGUNTAN
          </h2>
        </div>
        <div className="divide-y divide-line border-y border-line">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex items-center justify-between cursor-pointer list-none font-semibold text-green-deep">
                {f.q}
                <span
                  aria-hidden="true"
                  className="ml-4 text-accent transition-transform group-open:rotate-45 text-xl leading-none"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-ink-mute leading-relaxed pr-8">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ─── CTA final ──────────────────────────────────────────── */}
      <section id="contacto" className="max-w-6xl mx-auto px-6 pb-16 md:pb-24 scroll-mt-16">
        <Card variant="dark" padding="roomy" className="text-center relative overflow-hidden">
          <div className="relative">
            <LigaPlusMark size={72} className="mx-auto mb-5" />
            <h2 className="font-display text-4xl md:text-5xl tracking-display text-chalk mb-4">
              PRUÉBALO 30 DÍAS EN TU LIGA
            </h2>
            <p className="font-serif italic text-green-lime leading-relaxed mb-8 max-w-xl mx-auto">
              Plan mensual según el tamaño de tu liga, sin permanencia ni costos de
              instalación. Escribinos y te armamos una demo con datos reales de tu
              competencia.
            </p>
            <a href={MAILTO_DEMO}>
              <Button variant="accent">
                <Mail size={15} className="inline mr-1.5 -mt-0.5" />
                Escribir a {CONTACTO_EMAIL}
              </Button>
            </a>
            <p className="text-xs text-chalk/60 mt-4">Respondemos dentro de 1 día hábil.</p>
          </div>
        </Card>
      </section>

      {/* ─── Footer ─────────────────────────────────────────────── */}
      <footer className="bg-green-deep text-chalk">
        <div className="max-w-6xl mx-auto px-6 py-14">
          <div className="grid md:grid-cols-3 gap-10">
            <div>
              <LigaPlusLockup inverse />
              <p className="mt-4 text-sm text-chalk/70 leading-relaxed max-w-xs">
                La plataforma de gestión para ligas de fútbol amateur. Hecha en Chile, pensada
                para la cancha.
              </p>
            </div>
            <div>
              <div className="eyebrow-lime mb-4">→ Producto</div>
              <ul className="space-y-2 text-sm text-chalk/80">
                <li>
                  <a href="#funciones" className="hover:text-chalk">
                    Funciones
                  </a>
                </li>
                <li>
                  <a href="#producto" className="hover:text-chalk">
                    El producto
                  </a>
                </li>
                <li>
                  <a href="#como-funciona" className="hover:text-chalk">
                    Cómo funciona
                  </a>
                </li>
                <li>
                  <a href="#faq" className="hover:text-chalk">
                    Preguntas frecuentes
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <div className="eyebrow-lime mb-4">→ Contacto</div>
              <ul className="space-y-2 text-sm text-chalk/80">
                <li>
                  <a href={`mailto:${CONTACTO_EMAIL}`} className="hover:text-chalk">
                    {CONTACTO_EMAIL}
                  </a>
                </li>
                <li className="text-chalk/60">Santiago de Chile</li>
              </ul>
              <p className="mt-5 text-[11px] text-chalk/50 leading-relaxed">
                ¿Tu liga ya usa LigaPlus? Ingresa desde el dominio propio de tu liga — ahí
                está el acceso de administradores, delegados y árbitros.
              </p>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-green-mid flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="text-xs text-chalk/60 uppercase tracking-widest">
              © 2026 LigaPlus · Chile
            </div>
            <div className="text-[11px] text-chalk/40">
              Datos protegidos según Ley 19.628 · Respaldos diarios
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
