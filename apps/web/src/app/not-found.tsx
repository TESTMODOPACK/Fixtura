import Link from 'next/link';

/**
 * Página 404 global, completamente en español.
 * Reemplaza el "404 / This page could not be found" default de Next.
 */
export default function NotFound(): React.ReactElement {
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-6">
      <div className="text-center max-w-md">
        <div className="font-display text-7xl text-green-deep tracking-display mb-2">
          404
        </div>
        <div className="text-xl text-ink mb-4">No encontramos esa página</div>
        <p className="font-serif italic text-ink-mute mb-6">
          La dirección que ingresaste no existe en LigaPlus, o fue movida a otro
          lugar.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="px-4 py-2 bg-accent text-chalk rounded font-semibold hover:bg-accent/90"
          >
            Ir al inicio
          </Link>
          <Link
            href="/admin"
            className="px-4 py-2 border border-line text-ink rounded font-semibold hover:bg-paper-dark"
          >
            Ir al panel
          </Link>
        </div>
      </div>
    </div>
  );
}
