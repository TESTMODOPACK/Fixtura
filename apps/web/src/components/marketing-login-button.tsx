'use client';

import { LogIn } from 'lucide-react';
import { useState } from 'react';

import { LoginModal } from '@/components/login-modal';
import { Button } from '@/components/ui/button';

/**
 * Isla cliente para la landing comercial (server component): botón "Ingresar"
 * que abre el LoginModal. Tras un login válido, el propio LoginModal redirige
 * según el rol (resolveLandingByRole). Permite loguearse desde www.ligaplus.cl
 * sin tener que entrar por la IP.
 */
export function MarketingLoginButton(): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <LogIn size={15} className="inline mr-1 -mt-0.5" /> Ingresar
      </Button>
      <LoginModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
