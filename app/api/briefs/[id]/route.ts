import { NextRequest, NextResponse } from 'next/server'
import { fieldsChanged } from '@/lib/brief-service'
import { assertCanEdit, briefSnapshot, shootStartsForClient } from '@/lib/brief-service'
import { sendBriefEmail } from '@/lib/email'
import { readPortalClient } from '@/lib/portal/session'
import { getPortalStore } from '@/lib/portal/store'
import { hashToken } from '@/lib/portal/tokens'
import type { VideoDetail } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Brief not found' }, { status: 404 })

  try {
    const body = await req.json()
    const store = getPortalStore()
    await store.ensureReady()
    const brief = await store.getBriefById(id)
    if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 })

    const client = await readPortalClient(store).catch(() => null)
    const editToken = typeof body.editToken === 'string' ? body.editToken : ''
    const tokenHash = editToken ? hashToken(editToken) : null
    const starts = await shootStartsForClient(store, brief.client_id)
    const allowed = assertCanEdit(brief, { client, tokenHash }, starts, new Date())
    if (!allowed.ok) return NextResponse.json({ error: allowed.error }, { status: allowed.status })

    const agentName = typeof body.agentName === 'string' ? body.agentName.trim() : ''
    const propertyAddress = typeof body.propertyAddress === 'string' ? body.propertyAddress.trim() : ''
    const shootDate = typeof body.shootDate === 'string' ? body.shootDate.trim() : ''
    const agentOnSite = typeof body.agentOnSite === 'string' ? body.agentOnSite.trim() : ''
    const videoTypes = Array.isArray(body.videoTypes) ? body.videoTypes.filter((type: unknown) => typeof type === 'string') : []
    if (!agentName || !propertyAddress || !shootDate || !agentOnSite || videoTypes.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const next = {
      agent_name: agentName,
      property_address: propertyAddress,
      shoot_date: shootDate,
      agent_on_site: agentOnSite,
      gate_code: body.gateCode ? String(body.gateCode) : null,
      lockbox_code: body.lockboxCode ? String(body.lockboxCode) : null,
      access_notes: body.accessNotes ? String(body.accessNotes) : null,
      video_types: JSON.stringify(videoTypes),
      video_details: JSON.stringify(body.videoDetails || {}),
      drive_link: body.driveLink ? String(body.driveLink) : null,
      asset_notes: body.assetNotes ? String(body.assetNotes) : null,
    }
    const changedFields = fieldsChanged(brief, next)
    const updated = await store.updateBriefRecord(id, {
      ...next,
      previous_snapshot: briefSnapshot(brief),
      updated_at: new Date().toISOString(),
    })

    if (changedFields.length > 0) {
      const details = JSON.parse(updated.video_details || '{}') as Record<string, VideoDetail>
      sendBriefEmail({
        updated: true,
        changedFields,
        clientName: updated.client_email || updated.client_name,
        agentName: updated.agent_name,
        propertyAddress: updated.property_address,
        shootDate: updated.shoot_date,
        agentOnSite: updated.agent_on_site,
        gateCode: updated.gate_code || undefined,
        lockboxCode: updated.lockbox_code || undefined,
        accessNotes: updated.access_notes || undefined,
        videoTypes: JSON.parse(updated.video_types || '[]'),
        videoDetails: details,
        driveLink: updated.drive_link || undefined,
        assetNotes: updated.asset_notes || undefined,
        fileNames: [],
      }).catch((err) => console.error('Email send failed:', err))
    }

    return NextResponse.json({ success: true, id: updated.id, changedFields })
  } catch (error) {
    console.error('Brief update failed:', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
