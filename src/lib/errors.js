/**
 * Turning a thrown error into something a parent can act on.
 *
 * Every one of these messages used to be `err.message`, straight from fetch,
 * from Supabase, or from Postgres. What that actually put on screen, in the
 * sign-up form, was:
 *
 *     connect ECONNREFUSED /tmp/.s.PGSQL.55432
 *
 * A person cannot do anything with that, and it is frightening in a way the
 * real problem — "the server is not answering" — is not. So nothing raw is ever
 * shown: a message is either recognised and translated, or replaced by the
 * caller's plain-English fallback. The original still goes to the console,
 * where whoever is debugging will look for it.
 */

const PATTERNS = [
  [/failed to fetch|networkerror|network request failed|econnrefused|load failed|fetch failed|err_connection|err_internet/i,
   'Could not reach the server. Check your connection and try again.'],
  [/invalid login|invalid credentials|invalid email or password|bad credentials/i,
   'That email and password do not match.'],
  [/already registered|already exists|duplicate key|user_already_exists/i,
   'There is already an account with that email. Sign in instead.'],
  [/password.*(too short|at least|weak)|weak_password/i,
   'That password is too short. Use at least 8 characters.'],
  [/rate limit|too many requests|429/i,
   'Too many tries. Wait a minute and have another go.'],
  [/email.*(invalid|not valid)|invalid_email/i,
   'That does not look like an email address.'],
  [/not confirmed|confirm your email/i,
   'Check your email for the confirmation link, then sign in.'],
  [/timeout|timed out/i,
   'The server took too long to answer. Try again.'],
]

/**
 * @param err       whatever was thrown
 * @param fallback  what to say when the error is not one we recognise. Write it
 *                  for the screen it appears on — "That did not save" tells a
 *                  person more than any generic apology.
 */
export function humanError(err, fallback = 'That did not work. Please try again.') {
  const raw = (err && (err.message || String(err))) || ''
  if (raw) console.warn('[RankUp]', raw)
  for (const [pattern, message] of PATTERNS) {
    if (pattern.test(raw)) return message
  }
  return fallback
}

/**
 * Camera failures are reported by name rather than by message, and the names
 * are precise — which is worth using, because "you have blocked the camera" and
 * "this device has no camera" need completely different things from the person.
 */
export function cameraError(err) {
  const name = err?.name || ''
  if (/NotAllowedError|PermissionDenied/.test(name)) {
    return 'RankUp does not have permission to use the camera. Allow it in your browser settings, then try again.'
  }
  if (/NotFoundError|DevicesNotFound|OverconstrainedError/.test(name)) {
    return 'No camera was found on this device. You can use your phone’s own camera app instead.'
  }
  if (/NotReadableError|TrackStartError/.test(name)) {
    return 'Something else is using the camera. Close it and try again.'
  }
  if (/SecurityError/.test(name)) {
    return 'The camera only works on a secure (https) connection.'
  }
  return humanError(err, 'The camera could not be started.')
}
