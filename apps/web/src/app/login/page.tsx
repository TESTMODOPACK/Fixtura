'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { AuthTokens } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FixturaLockup } from '@/components/ui/logo';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/auth-store';

const LoginSchema = z.object({
  email: z.email('Email inválido').toLowerCase(),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
});
type LoginForm = z.infer<typeof LoginSchema>;

export default function LoginPage(): React.ReactElement {
  const router = useRouter();
  const setTokens = useAuthStore((s) => s.setTokens);

  const form = useForm<LoginForm>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: (vals: LoginForm) =>
      apiFetch<AuthTokens>('/auth/login', { method: 'POST', body: vals, skipAuth: true }),
    onSuccess: (tokens) => {
      setTokens(tokens);
      router.push('/dashboard');
    },
  });

  return (
    <main className="min-h-screen flex items-center justify-center bg-paper px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <FixturaLockup className="justify-center" />
        </div>

        <Card padding="roomy">
          <CardLabel>Acceso · Panel de liga</CardLabel>
          <h1 className="font-display text-4xl text-green-deep tracking-display leading-none mb-2">
            BIENVENIDO
          </h1>
          <p className="font-serif italic text-ink-mute mb-8">
            Ingresá con tu cuenta para gestionar tu liga.
          </p>

          <form
            onSubmit={form.handleSubmit((vals) => mutation.mutate(vals))}
            className="space-y-5"
          >
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              autoFocus
              {...form.register('email')}
              error={form.formState.errors.email?.message}
            />
            <Input
              label="Contraseña"
              type="password"
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

          <div className="mt-6 text-center">
            <a href="/forgot-password" className="text-xs text-ink-mute hover:text-green-deep">
              ¿Olvidaste tu contraseña?
            </a>
          </div>
        </Card>

        <p className="text-center text-xs text-ink-mute mt-6 font-serif italic">
          Fixtura — la cancha, organizada.
        </p>
      </div>
    </main>
  );
}
