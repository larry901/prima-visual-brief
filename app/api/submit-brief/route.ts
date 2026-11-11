import { NextRequest, NextResponse } from 'next/server'
import { sendBriefEmail } from '@/lib/email'
import { readPortalClient } from '@/lib/portal/session'
import { getPortalStore } from '@/lib/portal/store'
import { hashToken, newToken } from '@/lib/portal/tokens'

export const dynamic = 'force-dynamic'

function emailOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      agentName,
      propertyAddress,
      shootDate,
      agentOnSite,
      gateCode,
      lockboxCode,
      accessNotes,
      videoTypes,
      videoDetails,
      driveLink,
      assetNotes,
      clientEmail,
    } = body

    if (!agentName || !propertyAddress || !shootDate || !agentOnSite) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!Array.isArray(videoTypes) || videoTypes.length === 0) {
      return NextResponse.json({ error: 'Select at least one video type' }, { status: 400 })
    }

    const store = getPortalStore()
    await store.ensureReady()
    const sessionClient = await readPortalClient(store).catch(() => null)
    const submittedEmail = emailOrNull(clientEmail)
    const clientEmailStored = sessionClient?.email ?? submittedEmail
    const editToken = newToken()

    const brief = await store.createBriefRecord({
      client_name: clientEmailStored ?? '',
      client_email: clientEmailStored,
      client_id: sessionClient?.id ?? null,
      agent_name: agentName,
      property_address: propertyAddress,
      shoot_date: shootDate,
      agent_on_site: agentOnSite,
      gate_code: gateCode || null,
      lockbox_code: lockboxCode || null,
      access_notes: accessNotes || null,
      video_types: JSON.stringify(videoTypes),
      video_details: JSON.stringify(videoDetails || {}),
      drive_link: driveLink || null,
      asset_notes: assetNotes || null,
      file_paths: '[]',
      edit_token_hash: hashToken(editToken),
    })

    sendBriefEmail({
      clientName: clientEmailStored ?? '',
      agentName,
      propertyAddress,
      shootDate,
      agentOnSite,
      gateCode,
      lockboxCode,
      accessNotes,
      videoTypes,
      videoDetails: videoDetails || {},
      driveLink,
      assetNotes,
      fileNames: [],
    }).catch((err) => console.error('Email send failed:', err))

    return NextResponse.json({
      success: true,
      id: brief.id,
      editPath: `/brief/edit?token=${encodeURIComponent(editToken)}`,
    })
  } catch (err: unknown) {
    console.error('Submit error:', err)
    return NextResponse.json({ error: 'Submission failed' }, { status: 500 })
  }
}
