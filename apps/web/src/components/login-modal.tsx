'use client';

import { zodResolver } from '@/lib/zod-resolver';
import { useMutation } from '@tanstack/react-query';
import { ChevronRight, Trophy, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { AuthTokens, UserContext } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { CardLabel } from '@/components/ui/card';
import {
  FormErrorBanner,
  makeRhfErrorHandler,
  rhfErrorsToBanner,
} from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { apiFetch } from '@/lib/api';
import { resolveLandingByRole } from '@/lib/resolve-landing';
import { useAuthStore } from '@/store/auth-store';

const LoginSchema = z.object({
  email: z.email('Email inválido').toLowerCase(),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
});
type LoginForm = z.infer<typeof LoginSchema>;

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export function LoginModal({ open, onClose }: LoginModalProps): React.ReactElement | null {
  const router = useRouter();
  const setTokens = useAuthStore((s) => s.setTokens);
  const bannerRef = useRef<HTMLDivElement>(null);

  const form = useForm<LoginForm>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: '', password: '' },
  });

  const LABEL_MAP: Record<string, string> = {
    email: 'Email',
    password: 'Contraseña',
  };
  const fieldErrors = rhfErrorsToBanner(
    form.formState.errors as Record<string, unknown>,
    LABEL_MAP,
  );

  // T25 — multi-liga: si el login no trae tenant por defecto, el backend
  // devuelve las ligas del usuario y acá se elige una explícitamente.
  const [seleccionLiga, setSeleccionLiga] = useState<{
    tokens: AuthTokens;
    opciones: Array<{ id: string; nombre: string }>;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      form.reset();
      setSeleccionLiga(null);
    }
  }, [open, form]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const mutation = useMutation({
    mutationFn: async (vals: LoginForm) => {
      const tokens = await apiFetch<AuthTokens>('/auth/login', {
        method: 'POST',
        body: vals,
        skipAuth: true,
      });
      if (tokens.tenantsDisponibles && tokens.tenantsDisponibles.length > 0) {
        return { tokens, me: null };
      }
      const me = await apiFetch<UserContext>('/auth/me', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
        skipAuth: true,
      });
      return { tokens, me };
    },
    onSuccess: ({ tokens, me }) => {
      if (!me) {
        setSeleccionLiga({
          tokens,
          opciones: tokens.tenantsDisponibles ?? [],
        });
        return;
      }
      setTokens(tokens);
      onClose();
      router.push(resolveLandingByRole(me));
    },
  });

  const switchMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      const base = seleccionLiga?.tokens;
      if (!base) throw new Error('No hay sesión pendiente de selección.');
      const tokens = await apiFetch<AuthTokens>('/auth/switch-tenant', {
        method: 'POST',
        body: { tenantId },
        headers: { Authorization: `Bearer ${base.accessToken}` },
        skipAuth: true,
      });
      const me = await apiFetch<UserContext>('/auth/me', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
        skipAuth: true,
      });
      return { tokens, me };
    },
    onSuccess: ({ tokens, me }) => {
      setTokens(tokens);
      onClose();
      router.push(resolveLandingByRole(me));
    },
  });

  // El handler de validación ya scrollea al banner; el error de API también
  // tiene que quedar a la vista cuando el modal está scrolleado.
  useEffect(() => {
    if (mutation.isError) {
      bannerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [mutation.isError]);

  if (!open) return null;

  return (
    // Overlay scrolleable: centrado cuando cabe, scroll cuando el contenido
    // (banner de error, zoom, pantallas bajas) supera el alto — antes el
    // modal se recortaba por arriba y los mensajes quedaban invisibles.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-green-deep/60 backdrop-blur-sm">
      <div
        className="flex min-h-full items-center justify-center p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="w-full max-w-md my-4 bg-chalk rounded-card border border-line shadow-elev p-8 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded text-ink-mute hover:text-ink hover:bg-paper-dark"
          aria-label="Cerrar"
        >
          <X size={18} />
        </button>

        {seleccionLiga ? (
          <div>
            <CardLabel>Acceso · Panel de liga</CardLabel>
            <h2 className="font-display text-3xl text-green-deep tracking-display leading-none mb-2">
              ELIGE TU LIGA
            </h2>
            <p className="font-serif italic text-ink-mute mb-6 text-sm">
              Tu cuenta participa en más de una liga. ¿Cuál quieres gestionar?
            </p>
            {switchMutation.isError && (
              <p className="text-sm text-danger font-semibold mb-3">
                No se pudo entrar a esa liga. Intenta de nuevo.
              </p>
            )}
            <div className="space-y-2">
              {seleccionLiga.opciones.map((liga) => (
                <button
                  key={liga.id}
                  type="button"
                  disabled={switchMutation.isPending}
                  onClick={() => switchMutation.mutate(liga.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-card border border-line bg-paper hover:bg-paper-dark hover:border-green-deep/40 text-left transition-colors disabled:opacity-60"
                >
                  <span className="flex items-center gap-2 font-semibold text-ink">
                    <Trophy size={16} className="text-accent shrink-0" />
                    {liga.nombre}
                  </span>
                  <ChevronRight size={16} className="text-ink-mute shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
        <CardLabel>Acceso · Panel de liga</CardLabel>
        <h2 className="font-display text-3xl text-green-deep tracking-display leading-none mb-2">
          BIENVENIDO
        </h2>
        <p className="font-serif italic text-ink-mute mb-6 text-sm">
          Ingresa con tu cuenta para gestionar tu liga.
        </p>

        <form
          onSubmit={form.handleSubmit(
            (vals) => mutation.mutate(vals),
            makeRhfErrorHandler({
              formName: 'login',
              labelMap: LABEL_MAP,
              bannerRef,
            }),
          )}
          className="space-y-4"
        >
          <FormErrorBanner
            ref={bannerRef}
            fieldErrors={fieldErrors}
            apiError={mutation.error}
            validationTitle="Revisa los datos:"
            apiTitle="No se pudo iniciar sesión"
          />

          <Input
            label="Email"
            type="email"
            autoComplete="email"
            autoFocus
            {...form.register('email')}
            error={form.formState.errors.email?.message}
          />
          <PasswordInput
            label="Contraseña"
            autoComplete="current-password"
            {...form.register('password')}
            error={form.formState.errors.password?.message}
          />

          <Button
            type="submit"
            variant="accent"
            className="w-full"
            loading={mutation.isPending}
          >
            Entrar
          </Button>
        </form>

          <div className="mt-4 text-center">
            <a href="/forgot-password" className="text-xs text-ink-mute hover:text-green-deep">
              ¿Olvidaste tu contraseña?
            </a>
          </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
