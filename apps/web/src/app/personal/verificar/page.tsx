'use client';

import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  HelpCircle,
  LogOut,
  ScanLine,
  Search,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { VerificacionCarnet } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LigaPlusLockup } from '@/components/ui/logo';
import { useVerificarCarnet } from '@/hooks/use-jugador';
import { useLogout } from '@/hooks/use-logout';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/auth-store';

interface DetectedBarcode {
  rawValue: string;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
    };
  }
}

function ResultadoCard({
  r,
  onOtro,
}: {
  r: VerificacionCarnet;
  onOtro: () => void;
}): React.ReactElement {
  const ok = r.encontrado && r.habilitado;
  const titulo = ok ? 'Habilitado' : r.encontrado ? 'No habilitado' : 'No encontrado';
  const origen =
    r.qrValido === true
      ? 'QR verificado'
      : r.qrValido === false
        ? 'QR inválido'
        : 'Búsqueda por RUT';

  return (
    <div
      className={cn(
        'rounded-2xl border-2 overflow-hidden bg-white shadow-sm',
        ok ? 'border-green-bright' : 'border-danger',
      )}
    >
      <div
        className={cn(
          'px-5 py-4 flex items-center gap-3',
          ok ? 'bg-green-bright/15' : 'bg-danger/10',
        )}
      >
        {ok ? (
          <CheckCircle2 size={30} className="text-green-bright flex-shrink-0" />
        ) : (
          <XCircle size={30} className="text-danger flex-shrink-0" />
        )}
        <div className="min-w-0">
          <div
            className={cn(
              'font-display text-2xl tracking-display leading-none',
              ok ? 'text-green-deep' : 'text-danger',
            )}
          >
            {titulo}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-ink-mute mt-1">
            {origen}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        {r.jugador && (
          <div className="flex items-center gap-3">
            {r.jugador.clubEscudoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.jugador.clubEscudoUrl}
                alt={r.jugador.clubNombre}
                className="w-11 h-11 rounded-full object-cover bg-paper flex-shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-paper flex items-center justify-center flex-shrink-0">
                <HelpCircle size={18} className="text-ink-mute" />
              </div>
            )}
            <div className="min-w-0">
              <div className="font-semibold text-ink leading-tight">
                {r.jugador.nombres} {r.jugador.apellidos}
              </div>
              <div className="text-xs text-ink-mute">
                {r.jugador.rut} · {r.jugador.clubNombre} · {r.jugador.categoriaNombre}
                {r.jugador.numeroCamiseta != null
                  ? ` · #${r.jugador.numeroCamiseta}`
                  : ''}
              </div>
            </div>
          </div>
        )}

        {r.motivos.length > 0 && (
          <ul className="space-y-1">
            {r.motivos.map((m) => (
              <li key={m} className="text-sm text-danger flex items-start gap-1.5">
                <XCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>{m}</span>
              </li>
            ))}
          </ul>
        )}

        {r.torneosEnPlanilla.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-mute mb-1.5">
              En planilla de
            </div>
            <div className="flex flex-wrap gap-1.5">
              {r.torneosEnPlanilla.map((t) => (
                <span
                  key={t}
                  className="text-[11px] px-2 py-0.5 rounded bg-green-deep/10 text-green-deep font-medium"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-5 pb-4">
        <Button variant="dark" className="w-full" onClick={onOtro}>
          Verificar otro jugador
        </Button>
      </div>
    </div>
  );
}

export default function VerificarCarnetPage(): React.ReactElement | null {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const logout = useLogout();

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useAuthStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace('/');
  }, [hydrated, accessToken, router]);

  const verificar = useVerificarCarnet();
  const [resultado, setResultado] = useState<VerificacionCarnet | null>(null);
  const [soportaEscaner, setSoportaEscaner] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  const [camaraError, setCamaraError] = useState<string | null>(null);
  const [rut, setRut] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setSoportaEscaner(typeof window !== 'undefined' && !!window.BarcodeDetector);
  }, []);

  const detenerCamara = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setEscaneando(false);
  }, []);

  // Apagar la cámara al salir de la página (no dejar el LED encendido).
  useEffect(() => detenerCamara, [detenerCamara]);

  const procesar = useCallback(
    (input: { qr?: string; rut?: string }) => {
      verificar.mutate(input, {
        onSuccess: (r) => setResultado(r),
      });
    },
    // mutate es estable en TanStack Query v5.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const iniciarEscaneo = useCallback(async () => {
    setCamaraError(null);
    setResultado(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setEscaneando(true);
    } catch {
      setCamaraError(
        'No pudimos acceder a la cámara. Revisa el permiso del navegador o usa la búsqueda por RUT.',
      );
    }
  }, []);

  // El <video> recién se monta cuando escaneando=true: el stream se engancha acá.
  useEffect(() => {
    if (!escaneando) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.play().catch(() => {
      // Autoplay bloqueado: el usuario ve el frame congelado pero detect() igual corre.
    });
  }, [escaneando]);

  // Loop de detección: mientras la cámara está activa, busca un QR cada ~350ms.
  useEffect(() => {
    if (!escaneando || !window.BarcodeDetector) return;
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    let activo = true;
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      detector
        .detect(video)
        .then((codes) => {
          const valor = codes[0]?.rawValue?.trim();
          if (!activo || !valor) return;
          activo = false;
          window.clearInterval(timer);
          detenerCamara();
          procesar({ qr: valor });
        })
        .catch(() => {
          // Frames intermedios pueden fallar; se reintenta en el próximo tick.
        });
    }, 350);
    return () => {
      activo = false;
      window.clearInterval(timer);
    };
  }, [escaneando, detenerCamara, procesar]);

  const buscarPorRut = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!rut.trim()) return;
    detenerCamara();
    setResultado(null);
    procesar({ rut: rut.trim() });
  };

  const reiniciar = (): void => {
    setResultado(null);
    setRut('');
    verificar.reset();
  };

  if (!hydrated || !accessToken) return null;

  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-green-deep text-chalk">
        <div className="max-w-4xl mx-auto px-5 py-4 flex items-center justify-between">
          <LigaPlusLockup inverse showTag={false} />
          <button
            type="button"
            onClick={() => logout()}
            className="flex items-center gap-1.5 text-sm text-chalk/80 hover:text-chalk"
          >
            <LogOut size={15} /> Salir
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 py-8">
        <Link
          href="/personal"
          className="inline-flex items-center gap-1 text-xs text-ink-mute hover:text-ink mb-3"
        >
          <ArrowLeft size={13} /> Mi portal
        </Link>
        <div className="eyebrow mb-2">→ Paso de jugadores</div>
        <h1 className="font-display text-3xl text-green-deep tracking-display mb-6">
          Verificar carnet
        </h1>

        {resultado ? (
          <ResultadoCard r={resultado} onOtro={reiniciar} />
        ) : (
          <div className="space-y-5">
            {/* Escáner */}
            <Card padding="comfortable">
              <div className="flex items-center gap-2 mb-3">
                <ScanLine size={16} className="text-accent" />
                <span className="eyebrow">Escanear QR</span>
              </div>

              {escaneando ? (
                <>
                  <div className="rounded-xl overflow-hidden bg-ink aspect-square relative">
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video
                      ref={videoRef}
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-8 border-2 border-chalk/70 rounded-xl pointer-events-none" />
                  </div>
                  <p className="text-xs text-ink-mute mt-2 text-center">
                    Apunta al QR del carnet del jugador
                  </p>
                  <Button
                    variant="ghost"
                    className="w-full mt-2"
                    onClick={detenerCamara}
                  >
                    Detener cámara
                  </Button>
                </>
              ) : soportaEscaner ? (
                <>
                  <p className="text-sm text-ink-mute mb-3">
                    Escanea el QR que el jugador muestra desde su portal y confirma
                    su identidad y habilitación al instante.
                  </p>
                  <Button
                    variant="accent"
                    className="w-full"
                    onClick={() => void iniciarEscaneo()}
                  >
                    <Camera size={15} className="inline mr-1.5 -mt-0.5" />
                    Activar cámara
                  </Button>
                  {camaraError && (
                    <p className="text-xs text-danger mt-2">{camaraError}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-ink-mute">
                  Tu navegador no soporta el escaneo de QR. Usa la búsqueda por RUT
                  aquí abajo.
                </p>
              )}
            </Card>

            {/* Búsqueda por RUT */}
            <Card padding="comfortable">
              <div className="flex items-center gap-2 mb-3">
                <Search size={16} className="text-accent" />
                <span className="eyebrow">Buscar por RUT</span>
              </div>
              <form onSubmit={buscarPorRut} className="flex gap-2">
                <input
                  type="text"
                  value={rut}
                  onChange={(e) => setRut(e.target.value)}
                  placeholder="12.345.678-9"
                  inputMode="text"
                  autoComplete="off"
                  className="input flex-1"
                />
                <Button
                  type="submit"
                  variant="dark"
                  disabled={!rut.trim() || verificar.isPending}
                  loading={verificar.isPending}
                >
                  Buscar
                </Button>
              </form>
              <p className="text-xs text-ink-mute mt-2">
                Para cuando el jugador no tiene su carnet a mano.
              </p>
            </Card>

            {verificar.isPending && (
              <p className="text-center text-sm text-ink-mute">Verificando…</p>
            )}
            {verificar.isError && (
              <Card padding="tight" className="border-danger/40">
                <p className="text-sm text-danger">
                  No pudimos verificar. Revisa tu conexión e intenta de nuevo.
                </p>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
