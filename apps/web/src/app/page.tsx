import { headers } from 'next/headers';

import { MarketingHome } from '@/components/marketing-home';
import { TenantHome } from '@/components/tenant-home';
import { isMarketingHost } from '@/lib/host';

/**
 * Root home — decide server-side qué mostrar según el hostname:
 *   - ligaplus.cl             → MarketingHome (vender el SaaS)
 *   - <dominio-del-cliente>  → TenantHome (portal público de la liga)
 *   - localhost / IP          → TenantHome (dev / preview en VPS sin dominio)
 *
 * `?marketing=1` fuerza la landing en cualquier host — para previsualizarla
 * en dev o en el VPS antes de que el dominio apunte.
 *
 * La decisión es server-side porque `next/headers` solo funciona en server
 * components. Eso da SEO correcto sin un client-side flash.
 */
export default function RootPage({
  searchParams,
}: {
  searchParams?: { marketing?: string };
}): React.ReactElement {
  const host = headers().get('host');
  if (isMarketingHost(host) || searchParams?.marketing === '1') {
    return <MarketingHome />;
  }
  return <TenantHome />;
}
