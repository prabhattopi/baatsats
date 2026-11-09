import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BaatSats - Dakar Voice Lightning POS',
    short_name: 'BaatSats',
    description: 'Voice-First AI & Lightning Merchant Terminal for Senegal & West Africa',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#f7931a',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}