import type { Config } from 'tailwindcss';

/**
 * Sistema de diseño Fixtura.
 * Fuente: fixtura_brand_system.html y prototipo standalone.
 *
 * Filosofía: editorial deportivo (Panenka / El Gráfico) — NO SaaS genérico.
 *   Verde cancha profundo + naranja silbato + papel "tiza".
 *   Sin pasteles, sin gradientes innecesarios, sin sombras suaves.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Verde cancha — el alma de la marca
        green: {
          deep: '#0F2A1F', // Fondos oscuros, sidebar, cards-dark
          mid: '#1B4332',
          bright: '#2D6A4F', // CTA secundario, badges OK
          lime: '#95D5B2', // Acento claro, eyebrows en dark
        },
        // Papel "tiza" — fondos warm
        chalk: '#FAFAF7',
        paper: {
          DEFAULT: '#F1ECE2',
          dark: '#E5DCC5',
        },
        ink: {
          DEFAULT: '#1A1A1A',
          mute: '#888278',
        },
        line: '#D5CDB8', // Bordes por defecto
        accent: '#E76F26', // Silbato del árbitro — CTA primario
        // Estados (semánticos)
        success: '#2D6A4F',
        warning: '#E76F26',
        danger: '#C1272D',
      },
      fontFamily: {
        // Anton — display deportivo principal (titulares grandes, eyebrow)
        display: ['var(--font-anton)', 'Anton', 'sans-serif'],
        // Archivo Black — wordmark "FIXTURA" y números enormes
        display_alt: ['var(--font-archivo-black)', '"Archivo Black"', 'sans-serif'],
        // Newsreader italic — subtítulos editoriales
        serif: ['var(--font-newsreader)', 'Newsreader', 'serif'],
        // Geist — UI body, formularios, tablas
        sans: ['var(--font-geist)', 'Geist', 'system-ui', 'sans-serif'],
        // Space Grotesk — números, monospaced-ish
        mono: ['var(--font-space-grotesk)', '"Space Grotesk"', 'monospace'],
      },
      borderRadius: {
        card: '14px', // Estándar del prototipo
      },
      letterSpacing: {
        eyebrow: '0.18em', // 3px en font-size 11px
        display: '0.04em',
      },
      fontSize: {
        eyebrow: ['11px', { letterSpacing: '0.18em', fontWeight: '600' }],
      },
      boxShadow: {
        card: '0 1px 0 rgba(15, 42, 31, 0.04)',
        elev: '0 12px 30px rgba(0, 0, 0, 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
