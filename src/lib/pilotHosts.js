/**
 * Where Pilot, the AI helper in Parent Mode, may send a parent's question:
 * the AI providers a browser can call with the parent's own key. The same
 * list as the MTRX Horizyn site (docs/PILOT.md).
 *
 * One list, read by three places, so they cannot disagree:
 *   - vite.config.js puts exactly these in the page's connect-src;
 *   - the Pilot loader tells Pilot which OpenAI-compatible hosts it may use;
 *   - tests/pilot.mjs and tests/bundle.mjs check the policy against it.
 *
 * Nothing here is a secret and nothing goes through RankUp's server: the
 * parent's browser talks to the provider they chose, with their own key.
 */

/** The three main providers. */
export const PILOT_PROVIDER_HOSTS = Object.freeze([
  'api.anthropic.com',
  'api.openai.com',
  'generativelanguage.googleapis.com',
])

/** OpenAI-compatible services a parent may point Pilot at. */
export const PILOT_COMPATIBLE_HOSTS = Object.freeze([
  'openrouter.ai',
  'api.groq.com',
  'api.mistral.ai',
  'api.deepseek.com',
  'api.together.xyz',
  'api.fireworks.ai',
  'api.x.ai',
])

/** The parent's own computer, for a model they run themselves (any port). */
export const PILOT_LOCAL_HOSTS = Object.freeze(['localhost', '127.0.0.1'])

/** What connect-src gains for Pilot, in order. */
export function pilotConnectSources() {
  return [
    ...[...PILOT_PROVIDER_HOSTS, ...PILOT_COMPATIBLE_HOSTS].map((h) => `https://${h}`),
    ...PILOT_LOCAL_HOSTS.map((h) => `http://${h}:*`),
  ]
}
