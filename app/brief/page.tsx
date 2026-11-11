import { isIsoDate } from '@/lib/portal/cycle'
import BriefForm from './BriefForm'

export default function BriefPage({
  searchParams,
}: {
  searchParams: { name?: string; email?: string; shoot?: string }
}) {
  const shoot = searchParams.shoot && isIsoDate(searchParams.shoot) ? searchParams.shoot : ''
  const name = searchParams.name?.slice(0, 120) ?? ''
  const email = searchParams.email?.slice(0, 200) ?? ''
  return (
    <BriefForm
      key={`${name}|${email}|${shoot}`}
      initialAgentName={name}
      initialEmail={email}
      initialShootDate={shoot}
    />
  )
}
