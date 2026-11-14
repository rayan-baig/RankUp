import { useEffect, useState } from 'react'
import {
  QUICK_CHAT, QUICK_CHAT_TABS, QUICK_EMOJI, QUICK_CHAT_COOLDOWN_SECONDS, quickChatText,
} from '../data/quickChat.js'

/*
 * What this phone remembers for the bar: the last few sent, and the ones a
 * child starred. Per child, on this phone only; nothing here is sent.
 */
const recentKey = (kidId) => `rankup:quick-recent:${kidId}`
const favKey = (kidId) => `rankup:quick-favs:${kidId}`
const read = (key) => {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private window */ } }
const known = (id) => quickChatText(id) !== '💬'

/**
 * The quick chat bar: the only way a child chats in a guild.
 *
 * Tabs of ready-made messages, a row of big emoji, and a short row of the
 * ones this child used last or starred. One tap sends: what goes is the
 * message's id, never words, so there is nothing to type and nothing typed to
 * check. A short wait after each one, as the server has.
 */
export default function QuickChat({ kidId, onSend, disabled = false }) {
  const [tab, setTab] = useState('cheers')
  const [recent, setRecent] = useState(() => read(recentKey(kidId)).filter(known))
  const [favs, setFavs] = useState(() => read(favKey(kidId)).filter(known))
  const [starring, setStarring] = useState(false)
  const [cooling, setCooling] = useState(0)

  useEffect(() => {
    if (cooling <= 0) return undefined
    const t = setTimeout(() => setCooling((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooling])

  const send = async (id) => {
    if (starring) {
      const next = favs.includes(id) ? favs.filter((f) => f !== id) : [id, ...favs].slice(0, 8)
      setFavs(next); write(favKey(kidId), next)
      return
    }
    if (disabled || cooling > 0) return
    setCooling(QUICK_CHAT_COOLDOWN_SECONDS)
    const ok = await onSend(id)
    if (ok) {
      const next = [id, ...recent.filter((r) => r !== id)].slice(0, 6)
      setRecent(next); write(recentKey(kidId), next)
    }
  }

  const waiting = disabled || cooling > 0
  const shortRow = [...new Set([...favs, ...recent])].slice(0, 8)
  const list = tab === 'saved' ? favs.map((id) => QUICK_CHAT.find((m) => m.id === id) || QUICK_EMOJI.find((m) => m.id === id)).filter(Boolean)
    : QUICK_CHAT.filter((m) => m.tab === tab)

  return (
    <div data-testid="quick-chat">
      <div className="flex justify-between gap-1 mb-2" role="group" aria-label="Reactions" data-testid="quick-emoji">
        {QUICK_EMOJI.slice(0, 8).map((m) => (
          <button key={m.id} type="button" onClick={() => send(m.id)} disabled={waiting && !starring}
            className="text-2xl leading-none rounded-xl py-1.5 flex-1 transition-transform active:scale-90 disabled:opacity-50"
            style={{ background: favs.includes(m.id) && starring ? 'color-mix(in srgb, var(--warn) 25%, transparent)' : 'var(--surface-2)' }}
            aria-label={`Send ${m.text}`} data-quick={m.id}>
            {m.text}
          </button>
        ))}
      </div>

      {shortRow.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2" data-testid="quick-recent">
          <span className="text-[10px] uppercase tracking-wider text-muted self-center shrink-0">Yours</span>
          {shortRow.map((id) => (
            <button key={id} type="button" onClick={() => send(id)} disabled={waiting && !starring}
              className="chip whitespace-nowrap shrink-0 disabled:opacity-50" data-quick={id}>
              {favs.includes(id) ? '★ ' : ''}{quickChatText(id)}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto pb-1 mb-2" role="tablist" aria-label="Kinds of message" data-testid="quick-tabs">
        {[...QUICK_CHAT_TABS, { id: 'saved', label: 'Starred', icon: '★' }].map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold shrink-0"
            style={{
              background: tab === t.id ? 'var(--accent)' : 'var(--surface-2)',
              color: tab === t.id ? 'var(--bg)' : 'var(--ink-muted)',
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-0.5" data-testid="quick-list">
        {list.length === 0 && (
          <p className="text-xs text-muted col-span-2 py-2">Tap ☆ Star, then tap messages to keep them here.</p>
        )}
        {list.map((m) => (
          <button key={m.id} type="button" onClick={() => send(m.id)} disabled={waiting && !starring}
            className="rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold transition-transform active:scale-95 disabled:opacity-50"
            style={{
              background: 'color-mix(in srgb, var(--surface-2) 85%, var(--accent) 15%)',
              border: `1px solid ${favs.includes(m.id) ? 'var(--warn)' : 'var(--line)'}`,
            }}
            data-quick={m.id}>
            {starring && <span aria-hidden="true">{favs.includes(m.id) ? '★ ' : '☆ '}</span>}
            {m.text}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] text-muted" aria-live="polite">
          {starring ? 'Tap messages to star them.' : cooling > 0 ? `Next message in ${cooling}…` : 'Tap to send. No typing in guilds.'}
        </span>
        <button type="button" className="text-[11px] font-bold underline" onClick={() => setStarring((s) => !s)} data-testid="quick-star">
          {starring ? 'Done' : '☆ Star'}
        </button>
      </div>
    </div>
  )
}
