import { Resend } from 'resend'

const ACCENT = '#435A57'
const ACCENT_TEXT = '#839290'

/**
 * Staff-only sign-in mail. This is not sent to leads or clients.
 * The code is how the installed iPhone app signs in. The link signs in a browser.
 * Mail on iPhone opens the link in Safari, which does not share cookies with a home-screen app.
 */
export async function sendHubLinkEmail(to: string, url: string, code: string): Promise<void> {
  const key = process.env.EMAIL_API_KEY
  if (!key) throw new Error('EMAIL_API_KEY is not set')
  const resend = new Resend(key)
  const message = hubSignInEmailContent(url, code)
  const result = await resend.emails.send({
    from: 'Prima Visual <clients@primavisual.io>',
    to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  })
  if (result.error) throw new Error(result.error.message)
}

export function hubSignInEmailContent(url: string, code: string): { subject: string; html: string; text: string } {
  if (!/^\d{6}$/.test(code)) throw new Error('Invalid sign-in code')
  const safeUrl = escapeHtml(url)
  const text = [
    `${code} is your Prima Hub sign-in code.`,
    '',
    'Open the Prima Hub icon on your iPhone home screen. On the sign-in screen, enter this code. It expires in 20 minutes and works once.',
    '',
    'Do not tap the link for the home-screen app. Mail opens that link in Safari, and the app stays on the sign-in screen.',
    '',
    'Use this link only to sign in inside a browser:',
    url,
  ].join('\n')
  const html = `
      <div style="font-family: Inter, Arial, sans-serif; background:#000; color:#fff; padding:32px 20px;">
        <div style="max-width:480px; margin:0 auto;">
          <p style="letter-spacing:0.22em; text-transform:uppercase; color:${ACCENT_TEXT}; font-size:12px; margin:0 0 12px;">Prima Hub</p>
          <h1 style="font-family: Montserrat, Arial, sans-serif; font-size:28px; line-height:1.2; margin:0 0 12px;">Sign in</h1>
          <p style="color:#d4d4d4; font-size:15px; line-height:1.5; margin:0 0 8px;">${code} is your Prima Hub sign-in code.</p>
          <p style="font-family: Montserrat, Arial, sans-serif; font-size:40px; letter-spacing:0.28em; font-weight:700; margin:8px 0 20px; padding-left:0.28em;">${code}</p>
          <p style="color:#d4d4d4; font-size:15px; line-height:1.5;">Open the Prima Hub icon on your iPhone home screen and enter this code on the sign-in screen. It expires in 20 minutes and works once. The session lasts 30 days in the app.</p>
          <p style="color:#d4d4d4; font-size:15px; line-height:1.5;">Do not tap the button below for the home-screen app. On iPhone that opens Safari, and the app stays on the sign-in screen.</p>
          <p style="margin:28px 0 8px;">
            <a href="${safeUrl}" style="background:${ACCENT}; color:#ffffff; text-decoration:none; font-weight:700; padding:14px 22px; display:inline-block;">Sign in with a browser</a>
          </p>
          <p style="color:#a3a3a3; font-size:12px; word-break:break-all;">${safeUrl}</p>
        </div>
      </div>
    `
  return { subject: 'Your Prima Hub sign-in code', html, text }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
