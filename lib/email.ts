import { Resend } from 'resend'
import { VideoDetail } from './db'

const resend = new Resend(process.env.EMAIL_API_KEY)

interface BriefEmailData {
  clientName: string
  agentName: string
  propertyAddress: string
  shootDate: string
  agentOnSite: string
  gateCode?: string
  lockboxCode?: string
  accessNotes?: string
  videoTypes: string[]
  videoDetails: Record<string, VideoDetail>
  driveLink?: string
  assetNotes?: string
  fileNames: string[]
}

export async function sendBriefEmail(data: BriefEmailData) {
  const videoSections = data.videoTypes.map((type) => {
    const detail = data.videoDetails[type] || ({} as Partial<VideoDetail>)
    return `
      <div style="margin-bottom: 24px; padding: 16px; background: #f9f9f9; border-radius: 8px;">
        <h3 style="margin: 0 0 12px; color: #1A1A1A; font-size: 16px;">${type}</h3>
        ${detail.highlights ? `<p><strong>Highlights:</strong> ${detail.highlights}</p>` : ''}
        ${detail.avoid ? `<p><strong>Avoid:</strong> ${detail.avoid}</p>` : ''}
        ${detail.musicVibes?.length ? `<p><strong>Music Vibe:</strong> ${detail.musicVibes.join(', ')}</p>` : ''}
        ${detail.referenceArtist ? `<p><strong>Reference Artist/Song:</strong> ${detail.referenceArtist}</p>` : ''}
        ${detail.inspirationLinks?.length ? `<p><strong>Inspiration Links:</strong><br>${detail.inspirationLinks.map((l) => `<a href="${l}">${l}</a>`).join('<br>')}</p>` : ''}
        ${detail.inspirationThoughts ? `<p><strong>What they love about examples:</strong> ${detail.inspirationThoughts}</p>` : ''}
        ${detail.script ? `<p><strong>Script / Talking Points:</strong> ${detail.script}</p>` : ''}
        ${detail.toneOfVoice ? `<p><strong>Tone of Voice:</strong> ${detail.toneOfVoice}</p>` : ''}
      </div>
    `
  }).join('')

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Inter, Arial, sans-serif; max-width: 680px; margin: 0 auto; color: #1A1A1A; padding: 32px 16px;">
      <h1 style="font-size: 28px; font-weight: 700; margin-bottom: 4px;">New Creative Brief</h1>
      <p style="color: #6B7280; margin-top: 0; margin-bottom: 32px;">Submitted via Prima Visual Brief Form</p>

      <h2 style="font-size: 18px; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px;">Shoot Info</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr><td style="padding: 6px 0; color: #6B7280; width: 160px;">Client</td><td style="padding: 6px 0;"><strong>${data.clientName}</strong></td></tr>
        <tr><td style="padding: 6px 0; color: #6B7280;">Agent</td><td style="padding: 6px 0;">${data.agentName}</td></tr>
        <tr><td style="padding: 6px 0; color: #6B7280;">Property</td><td style="padding: 6px 0;">${data.propertyAddress}</td></tr>
        <tr><td style="padding: 6px 0; color: #6B7280;">Shoot Date</td><td style="padding: 6px 0;">${data.shootDate}</td></tr>
      </table>

      <h2 style="font-size: 18px; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px;">Access Info</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr><td style="padding: 6px 0; color: #6B7280; width: 160px;">Agent on site?</td><td style="padding: 6px 0;">${data.agentOnSite}</td></tr>
        ${data.gateCode ? `<tr><td style="padding: 6px 0; color: #6B7280;">Gate Code</td><td style="padding: 6px 0;">${data.gateCode}</td></tr>` : ''}
        ${data.lockboxCode ? `<tr><td style="padding: 6px 0; color: #6B7280;">Lockbox Code</td><td style="padding: 6px 0;">${data.lockboxCode}</td></tr>` : ''}
        ${data.accessNotes ? `<tr><td style="padding: 6px 0; color: #6B7280;">Access Notes</td><td style="padding: 6px 0;">${data.accessNotes}</td></tr>` : ''}
      </table>

      ${data.videoTypes.length > 0 ? `
        <h2 style="font-size: 18px; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px;">Video Sections</h2>
        ${videoSections}
      ` : ''}

      <h2 style="font-size: 18px; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px;">Files & Assets</h2>
      ${data.fileNames.length > 0 ? `
        <p><strong>Uploaded Files:</strong></p>
        <ul>${data.fileNames.map((f) => `<li>${f}</li>`).join('')}</ul>
      ` : '<p style="color: #6B7280;">No files uploaded.</p>'}
      ${data.driveLink ? `<p><strong>Drive Link:</strong> <a href="${data.driveLink}">${data.driveLink}</a></p>` : ''}
      ${data.assetNotes ? `<p><strong>Asset Notes:</strong> ${data.assetNotes}</p>` : ''}

      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 32px 0;">
      <p style="color: #6B7280; font-size: 12px;">Prima Visual — clients@primavisual.io</p>
    </body>
    </html>
  `

  return resend.emails.send({
    from: 'Prima Visual <clients@primavisual.io>',
    to: 'clients@primavisual.io',
    subject: `New Brief: ${data.clientName} — ${data.propertyAddress}`,
    html,
  })
}
