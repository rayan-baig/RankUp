/**
 * Checking the deployment is actually configured.
 *
 * The dangerous failure is a HALF-configured deploy: a Supabase URL with no
 * anon key, or Stripe switched on with no price ids. Those do not crash — they
 * fail quietly, at the worst moment, for a real family. So they are checked at
 * start-up and reported.
 *
 * Missing configuration is not automatically a problem: the app is designed to
 * run with no backend at all. Only INCONSISTENT configuration is.
 */

const read = (key) => import.meta.env?.[key] || ''

export function checkEnvironment() {
  const problems = []
  const notes = []

  const supabaseUrl = read('VITE_SUPABASE_URL')
  const supabaseKey = read('VITE_SUPABASE_ANON_KEY')

  if (supabaseUrl && !supabaseKey) {
    problems.push('VITE_SUPABASE_URL is set but VITE_SUPABASE_ANON_KEY is missing — nothing will sync.')
  }
  if (supabaseKey && !supabaseUrl) {
    problems.push('VITE_SUPABASE_ANON_KEY is set but VITE_SUPABASE_URL is missing — nothing will sync.')
  }
  if (supabaseUrl && supabaseUrl.startsWith('http://') && !supabaseUrl.includes('localhost')) {
    problems.push('VITE_SUPABASE_URL is not https. Data would travel unencrypted.')
  }
  if (!supabaseUrl && !supabaseKey) {
    notes.push('No backend configured — this device keeps its own data and nothing syncs.')
  }

  if (String(read('VITE_STRIPE_ENABLED')) === 'true') {
    if (!supabaseUrl) {
      problems.push('VITE_STRIPE_ENABLED is true but there is no backend. Billing needs one.')
    }
    notes.push('Billing is live. Check STRIPE_WEBHOOK_SECRET is set on the server too.')
  }

  if (read('VITE_VAPID_PUBLIC_KEY') && !supabaseUrl) {
    problems.push('A VAPID key is set but there is no backend to store subscriptions in.')
  }

  // A secret key in a VITE_ name would be published to every phone.
  for (const key of Object.keys(import.meta.env || {})) {
    if (!key.startsWith('VITE_')) continue
    const value = String(import.meta.env[key] || '')
    if (/^sk_(live|test)_/.test(value) || /^whsec_/.test(value) || /^sk-ant-/.test(value)) {
      problems.push(`${key} looks like a SECRET key. Anything named VITE_* is shipped to every phone — remove it now and rotate the key.`)
    }
  }

  return { ok: problems.length === 0, problems, notes }
}

/** Called once at start-up. Logs loudly; never blocks the app from running. */
export function reportEnvironment() {
  const result = checkEnvironment()
  if (result.problems.length) {
    console.error(
      `%c[RankUp] Configuration problems:\n${result.problems.map((p) => `  • ${p}`).join('\n')}`,
      'color:#e34948;font-weight:bold',
    )
  }
  if (result.notes.length && import.meta.env?.DEV) {
    console.info(`[RankUp] ${result.notes.join('\n[RankUp] ')}`)
  }
  return result
}
