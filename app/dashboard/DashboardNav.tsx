import Link from 'next/link'

export default function DashboardNav({ current }: { current: 'briefs' | 'clients' }) {
  const className = (active: boolean) =>
    active ? 'text-brand-dark font-medium' : 'text-brand-muted hover:text-brand-dark transition-colors'

  return (
    <nav className="flex items-center gap-3 text-sm" aria-label="Dashboard">
      <Link href="/dashboard/briefs" className={className(current === 'briefs')}>
        Briefs
      </Link>
      <Link href="/dashboard/clients" className={className(current === 'clients')}>
        Clients
      </Link>
      <Link href="/hub/" className={className(false)}>
        Hub
      </Link>
    </nav>
  )
}
