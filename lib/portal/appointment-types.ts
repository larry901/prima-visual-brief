/**
 * Acuity appointment types that feed the lead pipeline.
 * These never count as monthly shoots, even if someone lists them under
 * "Shoots that count". Strategy calls are not discovery calls.
 */
export function isDiscoveryAppointmentType(type: string): boolean {
  const norm = type.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  return norm === 'discovery' || norm.startsWith('discovery ')
}
