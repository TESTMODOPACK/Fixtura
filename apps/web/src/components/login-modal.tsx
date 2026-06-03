'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { AuthTokens, UserContext } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { CardLabel } from '@/components/ui/card';
import { makeRhfErrorHandler } from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { ApiError, apiFetch } from '@/lib/api';
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

  const form = useForm<LoginForm>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (!open) form.reset();
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-green-deep/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md bg-chalk rounded-card border border-line shadow-elev p-8 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded text-ink-mute hover:text-ink hover:bg-paper-dark"
          aria-label="Cerrar"
        >
          <X size={18} />
        </button>

        <CardLabel>Acceso · Panel de liga</CardLabel>
        <h2 className="font-display text-3xl text-green-deep tracking-display leading-none mb-2">
          BIENVENIDO
        </h2>
        <p className="font-serif italic text-ink-mute mb-6 text-sm">
          Ingresá con tu cuenta para gestionar tu liga.
        </p>

        <form
          onSubmit={form.handleSubmit(
            (vals) => mutation.mutate(vals),
            makeRhfErrorHandler({ formName: 'login' }),
          )}
          className="space-y-4"
        >
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

          {mutation.isError && (
            <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-card">
              {(mutation.error as ApiError | undefined)?.message ?? 'Error inesperado'}
            </div>
          )}

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
      </div>
    </div>
  );
}
