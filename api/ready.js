/**
 * Serverless function: is RankUp ready to serve families?
 *
 * The whole question: the database answers, the required settings are set,
 * every scheduled job has run recently, and no deleted family is still
 * waiting for Stripe to cancel. 200 or 503, with { ok, version } and nothing
 * else to anybody; the reasons with the CRON_SECRET. See api/health.js, which
 * does the work, and docs/OPERATIONS.md for which monitor to point here.
 *
 * Before launch this is 503, because no scheduled job has ever run. That is
 * the point of it: a site whose jobs were never scheduled is not ready.
 */
import { answerHealth } from './health.js'

export default function handler(req, res) {
  return answerHealth(req, res, { ready: true })
}
