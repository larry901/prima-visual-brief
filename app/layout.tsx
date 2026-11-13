import type { Metadata } from 'next'
import './globals.css'

const shareImage = {
  url: '/og.png',
  width: 1200,
  height: 630,
  alt: 'Prima Visual',
  type: 'image/png',
}

export const metadata: Metadata = {
  metadataBase: new URL('https://brief.primavisual.io'),
  title: 'Prima Visual — Pre-Shoot Creative Brief',
  description: 'Submit your creative brief before your shoot.',
  openGraph: {
    images: [shareImage],
  },
  twitter: {
    card: 'summary_large_image',
    images: [shareImage],
  },
  icons: {
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
