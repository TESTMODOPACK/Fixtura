import { headers } from 'next/headers';

import { MarketingHome } from '@/components/marketing-home';
import { TenantHome } from '@/components/tenant-home';
import { isMarketingHost } from '@/lib/host';

/**
 * Root home — decide server-side qué mostrar según el hostname:
 *   - fixtura.cl              → MarketingHome (vender el SaaS)
 *   - <dominio-del-cliente>  → TenantHome (portal público de la liga)
 *   - localhost / IP          → TenantHome (dev / preview en VPS sin dominio)
 *
 * La decisión es server-side porque `next/headers` solo funciona en server
 * components. Eso da SEO correcto sin un client-side flash.
 */
export default function RootPage(): React.ReactElement {
  const host = headers().get('host');
  if (isMarketingHost(host)) {
    return <MarketingHome />;
  }
  return <TenantHome />;
}
