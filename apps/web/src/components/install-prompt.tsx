'use client';

import { Download, Share, X } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Prompt de instalación de la PWA (F56.3).
 *
 *  - Android/Chrome/Edge: captura `beforeinstallprompt` y ofrece un botón
 *    "Instalar" que dispara el diálogo nativo.
 *  - iOS Safari: no expone `beforeinstallprompt`, así que mostramos las
 *    instrucciones manuales (Compartir → Agregar a inicio).
 *  - Si ya está instalada (display-mode standalone) o el usuario la
 *    descartó hace poco, no se muestra.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'fixtura-install-dismissed';
const DISMISS_DIAS = 14;

function descartadoReciente(): boolean {
  if (typeof window === 'undefined') return true;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < DISMISS_DIAS * 24 * 60 * 60 * 1000;
}

function esStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function esIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallPrompt(): React.ReactElement | null {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (esStandalone() || descartadoReciente()) return;

    // iOS no dispara beforeinstallprompt → mostramos instrucciones.
    if (esIOS()) {
      setIos(true);
      setVisible(true);
      return;
    }

    const onBeforeInstall = (e: Event): void => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    const onInstalled = (): void => setVisible(false);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const cerrar = (): void => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* localStorage puede fallar en modo privado — no es crítico */
    }
  };

  const instalar = async (): Promise<void> => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-3 inset-x-3 z-50 md:left-auto md:right-4 md:max-w-sm">
      <div className="bg-green-deep text-chalk rounded-card shadow-xl border border-green-mid p-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Instalá LigaPlus en tu teléfono</p>
          {ios ? (
            <p className="text-[13px] text-chalk/80 mt-1 leading-snug flex items-center gap-1 flex-wrap">
              Tocá <Share size={14} className="inline" /> <strong>Compartir</strong> y luego{' '}
              <strong>“Agregar a pantalla de inicio”</strong>.
            </p>
          ) : (
            <p className="text-[13px] text-chalk/80 mt-1 leading-snug">
              Accedé más rápido y usala sin conexión en la cancha.
            </p>
          )}
          {!ios && (
            <button
              type="button"
              onClick={instalar}
              className="mt-3 inline-flex items-center gap-1.5 bg-accent text-chalk text-sm font-semibold px-3 py-1.5 rounded-card hover:opacity-90"
            >
              <Download size={15} /> Instalar app
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar"
          className="p-1 rounded-card text-chalk/60 hover:text-chalk hover:bg-green-mid/50 flex-shrink-0"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
