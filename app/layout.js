import './globals.css';
import { Unbounded, Inter, JetBrains_Mono, Fraunces } from 'next/font/google';

// Self-hosted at build time by next/font (no external font requests at runtime).
const unbounded = Unbounded({ subsets: ['latin'], weight: ['600', '800'], variable: '--font-unbounded', display: 'swap' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-inter', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });
const fraunces = Fraunces({ subsets: ['latin'], weight: ['400', '600'], style: ['normal', 'italic'], variable: '--font-fraunces', display: 'swap' });

const DESCRIPTION =
  "An interactive liquid-metal experience that melts, fractures, and reforms as you scroll — until it doesn't. Built to be beautiful, and to mean it.";
const SOCIAL_DESCRIPTION =
  "Quicksilver is a small interactive experiment in liquid metal — touch it and it ripples, scroll and it melts, fractures, and comes back together. It's built purely to be beautiful. Then it tells you why real metal doesn't always get a happy ending.";
const TITLE = "Quicksilver — a liquid you can't hold onto";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { type: 'website', title: TITLE, description: SOCIAL_DESCRIPTION },
  twitter: { card: 'summary', title: TITLE, description: SOCIAL_DESCRIPTION },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${unbounded.variable} ${inter.variable} ${mono.variable} ${fraunces.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
