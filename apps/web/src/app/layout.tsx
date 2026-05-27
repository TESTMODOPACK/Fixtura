import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import { Anton, Archivo_Black, Newsreader, Space_Grotesk } from 'next/font/google';

import { OfflineBanner } from '@/components/offline-banner';
import { ServiceWorkerRegister } from '@/components/service-worker-register';
import { Providers } from '@/providers/providers';

import './globals.css';

const anton = Anton({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-anton',
  display: 'swap',
});

const archivoBlack = Archivo_Black({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-archivo-black',
  display: 'swap',
});

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400'],
  style: ['italic', 'normal'],
  variable: '--font-newsreader',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Fixtura · Plataforma para ligas amateur',
  description:
    'Gestión integral de torneos, fixture, designaciones, finanzas y comunidad para ligas amateur de Chile y LATAM.',
  applicationName: 'Fixtura',
  authors: [{ name: 'Fixtura' }],
  creator: 'Fixtura',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.svg',
    apple: '/icons/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Fixtura',
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
        </Providers>
      </body>
    </html>
  );
}
