import { Geist, Geist_Mono } from 'next/font/google';

/**
 * Geist for UI text, Geist Mono for data, addresses and the terminal. Self-hosted
 * at build time by next/font as ONE variable file per family: every weight the
 * UI uses comes from that file, instead of nine static files and nine glyph
 * atlases in the renderer.
 */
const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
  weight: 'variable',
});
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
  weight: 'variable',
});
export const fontClassName = `${geistSans.variable} ${geistMono.variable}`;
