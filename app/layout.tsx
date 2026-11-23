import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter, JetBrains_Mono, Unbounded } from 'next/font/google';
import type { ReactNode } from 'react';
import { getConfig } from '../lib/server/config.ts';
import './styles/tokens.css';
import './styles/base.css';
import './styles/sections.css';
import './styles/chrome.css';
import './styles/epilogue.css';

// Self-hosted at build time by next/font: no font requests leave the site.
const unbounded = Unbounded({
  subsets: ['latin'],
  weight: ['600', '800'],
  variable: '--font-unbounded',
  display: 'swap',
});
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-inter',
  display: 'swap',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
  display: 'swap',
});

const TITLE = "Quicksilver — a liquid you can't hold onto";
const DESCRIPTION =
  "An interactive liquid-metal experience that melts, fractures, and reforms as you scroll — until it doesn't. Built to be beautiful, and to mean it.";
const SOCIAL_DESCRIPTION =
  "Quicksilver is a small interactive experiment in liquid metal — touch it and it ripples, scroll and it melts, fractures, and comes back together. It's built purely to be beautiful. Then it tells you why real metal doesn't always get a happy ending.";

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(getConfig().siteUrl),
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/' },
    openGraph: { type: 'website', url: '/', title: TITLE, description: SOCIAL_DESCRIPTION },
    twitter: { card: 'summary', title: TITLE, description: SOCIAL_DESCRIPTION },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${unbounded.variable} ${inter.variable} ${mono.variable} ${fraunces.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
