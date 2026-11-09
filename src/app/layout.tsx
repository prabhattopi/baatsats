import type { Metadata, Viewport } from 'next';
import './globals.css';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

export const metadata: Metadata = {
  title: 'BaatSats | AI Voice Lightning Merchant POS',
  description: 'Instant Wolof & French voice billing over Bitcoin Lightning & Nostr.',
  applicationName: 'BaatSats',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon-192.png',
    apple: '/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'BaatSats',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#f7931a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="wo">
      <body className="min-h-screen bg-slate-950 text-slate-50 antialiased selection:bg-amber-500 selection:text-black">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}