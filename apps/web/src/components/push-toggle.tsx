'use client';

import { Bell, BellOff, BellRing } from 'lucide-react';
import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import { toastError, toastSuccess } from '@/lib/toast';

/**
 * Toggle de notificaciones push (Web Push / VAPID, F56.4).
 *
 * Suscribe el navegador a un scope (TORNEO/EQUIPO/PARTIDO/GLOBAL) y manda
 * la suscripción a /public/push/subscribe. El backend (PushService) la usa
 * para notificar — ej. resultado final al cerrar el acta.
 *
 * Se auto-oculta si el navegador no soporta push o si no está configurada
 * la clave pública VAPID (NEXT_PUBLIC_VAPID_PUBLIC_KEY).
 */

type Estado = 'cargando' | 'soportado' | 'activo' | 'denegado' | 'no-soportado';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

function soporta(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function PushToggle({
  scopeType,
  scopeId = null,
  label = 'Recibir notificaciones',
}: {
  scopeType: 'TORNEO' | 'EQUIPO' | 'PARTIDO' | 'GLOBAL';
  scopeId?: string | null;
  label?: string;
}): React.ReactElement | null {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    if (!soporta() || !VAPID_PUBLIC_KEY) {
      setEstado('no-soportado');
      return;
    }
    if (Notification.permission === 'denied') {
      setEstado('denegado');
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEstado(sub ? 'activo' : 'soportado'))
      .catch(() => setEstado('soportado'));
  }, []);

  const activar = async (): Promise<void> => {
    setTrabajando(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        setEstado(permiso === 'denied' ? 'denegado' : 'soportado');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
      const json = sub.toJSON();
      await apiFetch<{ id: string }>('/public/push/subscribe', {
        method: 'POST',
        body: {
          scopeType,
          scopeId,
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? null,
          auth: json.keys?.auth ?? null,
        },
      });
      setEstado('activo');
      toastSuccess('Notificaciones activadas.');
    } catch (err) {
      toastError(err);
    } finally {
      setTrabajando(false);
    }
  };

  const desactivar = async (): Promise<void> => {
    setTrabajando(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiFetch('/public/push/unsubscribe', {
          method: 'POST',
          body: { endpoint: sub.endpoint },
        }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setEstado('soportado');
      toastSuccess('Notificaciones desactivadas.');
    } catch (err) {
      toastError(err);
    } finally {
      setTrabajando(false);
    }
  };

  // No mostramos nada si el navegador no soporta o falta la clave VAPID.
  if (estado === 'cargando' || estado === 'no-soportado') return null;

  if (estado === 'denegado') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-mute">
        <BellOff size={14} /> Notificaciones bloqueadas en el navegador
      </span>
    );
  }

  const activo = estado === 'activo';
  return (
    <button
      type="button"
      onClick={activo ? desactivar : activar}
      disabled={trabajando}
      className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-card border border-line hover:bg-paper-dark disabled:opacity-60"
    >
      {activo ? <BellRing size={15} className="text-green-bright" /> : <Bell size={15} />}
      {activo ? 'Notificaciones activadas' : label}
    </button>
  );
}
