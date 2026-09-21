/**
 * The app must not break when the models change, and they will.
 *
 * This is not hypothetical. The photo check used to carry a hardcoded list of
 * which models accept an effort setting. The list was wrong: it sent the
 * parameter to Haiku 4.5, which rejects it, so every check returned 400 — and
 * the family's monthly allowance had already been spent on a call that never
 * ran. A list in a file nobody is looking at does not stay true.
 *
 * So the code negotiates instead: it tries the richer request, and the first
 * time the API says a parameter is not for this model it drops it and never
 * sends it again. These checks hold that behaviour to three promises — it
 * recovers, it only pays the cost of learning once, and a model released next
 * year that accepts more simply gets more.
 */
import { ask, servedBy, MODEL } from '../api/_shared/ai.js'

let fails = 0
const ok = (label, cond, detail = '') => {
  if (cond) console.log(`  PASS ${label}`)
  else { console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); fails += 1 }
}

const err = (status, message) => Object.assign(new Error(message), { status })

/** A stand-in API that records what it was sent and refuses what we tell it to. */
function fakeClient({ rejectEffort = false, rejectBeta = false } = {}) {
  const calls = []
  const handle = async (body, viaBeta) => {
    calls.push({ body, viaBeta })
    if (rejectBeta && viaBeta) throw err(400, 'fallbacks: unsupported for this account')
    if (rejectEffort && body.output_config?.effort) {
      throw err(400, 'output_config.effort is not supported for this model')
    }
    return { model: body.model, content: [{ type: 'text', text: 'ok' }], usage: {} }
  }
  return {
    calls,
    messages: { create: (b) => handle(b, false) },
    beta: { messages: { create: (b) => handle(b, true) } },
  }
}

const base = (model) => ({ model, max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] })

console.log('\n=== A model that takes everything is sent everything ===')
{
  const c = fakeClient()
  await ask(c, base('model-modern-a'), { effort: 'medium' })
  ok('the effort setting went out', c.calls[0].body.output_config?.effort === 'medium')
  ok('and so did the refusal fallback', c.calls[0].viaBeta === true)
  ok('in a single call', c.calls.length === 1)
}

console.log('\n=== A model that rejects the effort setting still gets an answer ===')
{
  const c = fakeClient({ rejectEffort: true })
  const res = await ask(c, base('model-no-effort-b'), { effort: 'medium' })
  ok('the request succeeded rather than 400ing at the caller', res.content[0].text === 'ok')
  ok('it was retried without the parameter', !c.calls.at(-1).body.output_config)
  ok('and it cost exactly one extra call to learn that', c.calls.length === 2)
}

console.log('\n=== And it only learns once, however many photos follow ===')
// The failure that started all this was paying the cost on EVERY call.
{
  const c = fakeClient({ rejectEffort: true })
  await ask(c, base('model-no-effort-c'), { effort: 'medium' })
  const afterFirst = c.calls.length
  await ask(c, base('model-no-effort-c'), { effort: 'medium' })
  await ask(c, base('model-no-effort-c'), { effort: 'medium' })
  ok('the next two photos cost one call each, not two',
    c.calls.length === afterFirst + 2, `${c.calls.length} calls in total`)
  ok('and none of them sent the parameter again',
    c.calls.slice(afterFirst).every((call) => !call.body.output_config))
}

console.log('\n=== An account without the fallback beta degrades rather than fails ===')
{
  const c = fakeClient({ rejectBeta: true })
  const res = await ask(c, base('model-no-beta-d'), { effort: 'medium' })
  ok('the answer still came back', res.content[0].text === 'ok')
  ok('by asking plainly instead', c.calls.at(-1).viaBeta === false)
}

console.log('\n=== What is learned belongs to one model, not to all of them ===')
// Otherwise one cheap model's limitation would quietly cap a better one.
{
  const strict = fakeClient({ rejectEffort: true })
  await ask(strict, base('model-strict-e'), { effort: 'medium' })
  const generous = fakeClient()
  await ask(generous, base('model-generous-f'), { effort: 'high' })
  ok('a second model is still offered the effort setting',
    generous.calls[0].body.output_config?.effort === 'high')
}

console.log('\n=== An error that is not about a parameter is not swallowed ===')
{
  const c = {
    calls: [],
    messages: { create: async () => { throw err(500, 'upstream exploded') } },
    beta: { messages: { create: async () => { throw err(500, 'upstream exploded') } } },
  }
  let thrown = null
  try { await ask(c, base('model-broken-g'), { effort: 'medium' }) } catch (e) { thrown = e }
  ok('a 500 reaches the caller, who refunds the check', thrown?.status === 500)
}

console.log('\n=== The operator can see what actually answered ===')
{
  const plain = servedBy({ model: 'model-x', usage: {} })
  ok('the model that replied is reported', plain.model === 'model-x')
  ok('and no fallback is claimed when none happened', plain.fell_back === false)
  const rescued = servedBy({ model: 'model-y', usage: { iterations: [{ type: 'fallback_message' }] } })
  ok('a rescued request says so', rescued.fell_back === true)
  ok('with a sensible default when the reply carries no model', servedBy({}).model === MODEL)
}

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
