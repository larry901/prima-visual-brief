import { Resend } from 'resend'

const ACCENT = '#435A57'
const ACCENT_TEXT = '#839290'

/** Staff-only sign-in mail. This is not sent to leads or clients. */
export async function sendHubLinkEmail(to: string, url: string): Promise<void> {
  const key = process.env.EMAIL_API_KEY
  if (!key) throw new Error('EMAIL_API_KEY is not set')
  const resend = new Resend(key)
  const result = await resend.emails.send({
    from: 'Prima Visual <clients@primavisual.io>',
    to,
    subject: 'Your Prima Hub sign-in link',
    html: `
      <div style="font-family: Inter, Arial, sans-serif; background:#000; color:#fff; padding:32px 20px;">
        <div style="max-width:480px; margin:0 auto;">
          <p style="letter-spacing:0.22em; text-transform:uppercase; color:${ACCENT_TEXT}; font-size:12px; margin:0 0 12px;">Prima Hub</p>
          <h1 style="font-family: Montserrat, Arial, sans-serif; font-size:28px; line-height:1.2; margin:0 0 12px;">Sign in</h1>
          <p style="color:#d4d4d4; font-size:15px; line-height:1.5;">This link is for Prima Visual staff. It expires in 20 minutes and works once. The session lasts 30 days on this device.</p>
          <p style="margin:28px 0;">
            <a href="${url}" style="background:${ACCENT}; color:#ffffff; text-decoration:none; font-weight:700; padding:14px 22px; display:inline-block;">Open Prima Hub</a>
          </p>
          <p style="color:#a3a3a3; font-size:12px; word-break:break-all;">${escapeHtml(url)}</p>
        </div>
      </div>
    `,
  })
  if (result.error) throw new Error(result.error.message)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
