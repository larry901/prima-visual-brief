'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/hub/', label: 'Today', match: (path: string) => path === '/hub' || path === '/hub/' },
  { href: '/hub/leads', label: 'Leads', match: (path: string) => path.startsWith('/hub/leads') },
  { href: '/hub/edits', label: 'Edits', match: (path: string) => path.startsWith('/hub/edits') },
  { href: '/hub/clients', label: 'Clients', match: (path: string) => path.startsWith('/hub/clients') },
  { href: '/hub/kpis', label: 'KPIs', match: (path: string) => path.startsWith('/hub/kpis') },
]

export default function HubTabs() {
  const pathname = usePathname() || '/hub'
  return (
    <nav className="hub-tabs" aria-label="Hub">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} className="hub-tab" aria-current={tab.match(pathname) ? 'page' : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
