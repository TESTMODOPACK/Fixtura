import type { ReactNode } from 'react';

export default function LigaPublicLayout({
  children,
}: {
  children: ReactNode;
  params: { ligaSlug: string };
}): React.ReactElement {
  // El header lo monta cada página individualmente (necesita acceso a
  // ligaNombre del fetch del resumen / tabla / etc.). Esto evita un
  // doble fetch en este layout.
  return <div className="min-h-screen bg-paper text-ink">{children}</div>;
}
