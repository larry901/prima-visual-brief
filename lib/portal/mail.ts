import { Resend } from 'resend'

export async function sendMagicLinkEmail(to: string, name: string, url: string): Promise<void> {
  const key = process.env.EMAIL_API_KEY
  if (!key) throw new Error('EMAIL_API_KEY is not set')
  const resend = new Resend(key)
  const result = await resend.emails.send({
    from: 'Prima Visual <clients@primavisual.io>',
    to,
    subject: 'Your Prima Visual sign-in link',
    html: `
      <div style="font-family: Inter, Arial, sans-serif; background:#000; color:#fff; padding:32px 20px;">
        <div style="max-width:480px; margin:0 auto;">
          <p style="letter-spacing:0.22em; text-transform:uppercase; color:#B0892F; font-size:12px; margin:0 0 12px;">Prima Visual</p>
          <h1 style="font-family: Montserrat, Arial, sans-serif; font-size:28px; line-height:1.2; margin:0 0 12px;">Sign in to your portal</h1>
          <p style="color:#d4d4d4; font-size:15px; line-height:1.5;">Hi ${escapeHtml(name)}, this link signs you in for 14 days. It expires in 20 minutes and works once.</p>
          <p style="margin:28px 0;">
            <a href="${url}" style="background:#B0892F; color:#000; text-decoration:none; font-weight:700; padding:14px 22px; display:inline-block;">Open my portal</a>
          </p>
          <p style="color:#a3a3a3; font-size:12px; word-break:break-all;">${escapeHtml(url)}</p>
        </div>
      </div>
    `,
  })
  if (result.error) {
    throw new Error(result.error.message)
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
