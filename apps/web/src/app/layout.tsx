import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';

import { InstallPrompt } from '@/components/install-prompt';
import { OfflineBanner } from '@/components/offline-banner';
import { ServiceWorkerRegister } from '@/components/service-worker-register';
import { Providers } from '@/providers/providers';

import './globals.css';

// Sprint 44E — Self-hosted via next/font/local (archivos en /public/fonts).
// Antes usábamos next/font/google que descarga las fuentes en build-time
// desde fonts.googleapis.com. Eso falla con ETIMEDOUT cuando el VPS de prod
// no puede llegar a Google (firewall outbound, DNS, o outage transitorio),
// y rompe el build entero. Self-hosting elimina la dependencia de internet
// en build-time. Los .woff2 vienen de jsdelivr fontsource (CDN estable).
const anton = localFont({
  src: '../../public/fonts/anton-400.woff2',
  variable: '--font-anton',
  display: 'swap',
  weight: '400',
});

const archivoBlack = localFont({
  src: '../../public/fonts/archivo-black-400.woff2',
  variable: '--font-archivo-black',
  display: 'swap',
  weight: '400',
});

const newsreader = localFont({
  src: [
    { path: '../../public/fonts/newsreader-400.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/newsreader-400-italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-newsreader',
  display: 'swap',
});

const spaceGrotesk = localFont({
  src: [
    { path: '../../public/fonts/space-grotesk-500.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/space-grotesk-600.woff2', weight: '600', style: 'normal' },
    { path: '../../public/fonts/space-grotesk-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'LigaPlus · Plataforma para ligas amateur',
  description:
    'Gestión integral de torneos, fixture, designaciones, finanzas y comunidad para ligas amateur de Chile y LATAM.',
  applicationName: 'LigaPlus',
  authors: [{ name: 'LigaPlus' }],
  creator: 'LigaPlus',
  manifest: '/manifest.json',
  icons: {
    icon: '/brand/mark.png',
    apple: '/brand/mark.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LigaPlus',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#0F2A1F',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <html
      lang="es"
      className={`${anton.variable} ${archivoBlack.variable} ${newsreader.variable} ${GeistSans.variable} ${spaceGrotesk.variable}`}
    >
      <body className="font-sans antialiased">
        <Providers>
          <ServiceWorkerRegister />
          <OfflineBanner />
          {children}
          <InstallPrompt />
        </Providers>
      </body>
    </html>
  );
}
