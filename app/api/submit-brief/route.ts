import { NextRequest, NextResponse } from 'next/server'
import { insertBrief } from '@/lib/db'
import { sendBriefEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      clientName,
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
      filePaths,
      fileNames,
    } = body

    if (!clientName || !agentName || !propertyAddress || !shootDate || !agentOnSite) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const id = insertBrief({
      client_name: clientName,
      agent_name: agentName,
      property_address: propertyAddress,
      shoot_date: shootDate,
      agent_on_site: agentOnSite,
      gate_code: gateCode || undefined,
      lockbox_code: lockboxCode || undefined,
      access_notes: accessNotes || undefined,
      video_types: videoTypes || [],
      video_details: videoDetails || {},
      drive_link: driveLink || undefined,
      asset_notes: assetNotes || undefined,
      file_paths: filePaths || [],
    })

    // Send email (don't block on failure)
    sendBriefEmail({
      clientName,
      agentName,
      propertyAddress,
      shootDate,
      agentOnSite,
      gateCode,
      lockboxCode,
      accessNotes,
      videoTypes: videoTypes || [],
      videoDetails: videoDetails || {},
      driveLink,
      assetNotes,
      fileNames: fileNames || [],
    }).catch((err) => console.error('Email send failed:', err))

    return NextResponse.json({ success: true, id })
  } catch (err: unknown) {
    console.error('Submit error:', err)
    return NextResponse.json({ error: 'Submission failed' }, { status: 500 })
  }
}
