import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Prima Visual — Pre-Shoot Creative Brief',
  description: 'Submit your creative brief before your shoot.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
