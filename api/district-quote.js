/**
 * Serverless function: "Get a quote", for a district too big for the
 * self-serve plan or wanting to pay another way.
 *
 * No account needed. What the person typed is checked (src/lib/quoteRules.js,
 * the same rules as the form), then sent by email to whoever runs RankUp
 * (SALES_EMAIL, or SUPPORT_EMAIL when that is all that is set), with the
 * person's own address as the reply-to, through the email sender every other
 * RankUp email uses. Nothing they typed is stored: the database keeps only a
 * keyed hash of where the request came from and when, to limit it to 3 an
 * hour from one address and 30 an hour in all (record_district_quote).
 */
import { emailSettings, emailConfigured, sendEmail, districtQuoteEmail } from './_shared/email.js'
import { reportError, makeServiceRpc } from './_shared/job.js'
import { ipKey } from './_shared/gifts.js'
import { checkQuoteForm } from '../src/lib/quoteRules.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' })

  const settings = emailSettings()
  const to = (process.env.SALES_EMAIL || process.env.SUPPORT_EMAIL || '').trim()
  if (!SUPABASE_URL || !SERVICE_KEY || !emailConfigured(settings) || !to) {
    return res.status(503).json({ error: 'not_configured' })
  }

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = null }
  }
  const { ok, errors, clean } = checkQuoteForm(body || {})
  if (!ok) return res.status(400).json({ error: 'invalid', fields: Object.keys(errors) })

  const serviceRpc = makeServiceRpc(SUPABASE_URL, SERVICE_KEY)
  let mark
  try {
    // The address itself is never stored: a keyed hash, under the server's own key.
    mark = await serviceRpc('record_district_quote', { p_ip_key: await ipKey(req, SERVICE_KEY) })
  } catch (err) {
    await reportError('district-quote', err)
    return res.status(502).json({ error: 'not_sent' })
  }
  if (!mark?.ok) return res.status(429).json({ error: mark?.reason || 'busy' })

  const email = districtQuoteEmail(clean, { site: process.env.PUBLIC_SITE_URL || '' })
  const sent = await sendEmail({ to, ...email, replyTo: clean.email, idempotencyKey: `district-quote:${mark.id}` }, settings)
  if (!sent.ok) {
    await reportError('district-quote', `quote request not sent: ${sent.status} ${sent.error || ''}`.trim())
    return res.status(502).json({ error: 'not_sent' })
  }
  return res.status(200).json({ ok: true })
}
