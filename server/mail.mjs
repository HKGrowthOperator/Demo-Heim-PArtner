// E-Mail-Versand über Resend, wie im Sales-Cockpit (RESEND_API_KEY + EMAIL_FROM).
// Ohne beides wird nichts verschickt: Die Mail landet im Postausgang auf dem Volume.

export const mailKonfiguriert = () => !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i
export const gueltigeMail = s => typeof s === 'string' && s.length <= 200 && EMAIL_RE.test(s.trim())

/** anhaenge: [{ name, buf }] */
export async function senden({ an, kopie = [], antwortAn, betreff, html, text, anhaenge = [] }) {
  const url = process.env.RESEND_API_URL || 'https://api.resend.com/emails'
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: an,
      cc: kopie.length ? kopie : undefined,
      reply_to: antwortAn || undefined,
      subject: betreff,
      html,
      text,
      attachments: anhaenge.map(a => ({ filename: a.name, content: Buffer.from(a.buf).toString('base64') })),
    }),
    signal: AbortSignal.timeout(30000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body.message || body.name || 'Versand abgelehnt'}`)
  return body.id || null
}
