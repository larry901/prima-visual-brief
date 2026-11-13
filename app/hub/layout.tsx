import type { Metadata, Viewport } from 'next'
import HubServiceWorker from './HubServiceWorker'

export const metadata: Metadata = {
  title: 'Prima Hub',
  description: 'Staff hub for Prima Visual.',
  manifest: '/hub/manifest.webmanifest',
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: 'Prima Hub',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/hub/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/hub/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/hub/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="hub-root">
      <HubServiceWorker />
      {children}
    </div>
  )
}
