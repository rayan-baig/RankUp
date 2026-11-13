import { useState } from 'react'
import { FIRST_WORDS, SECOND_WORDS, NICKNAME_CHANGE_DAYS, nicknameFrom, nicknamePieces, shuffleNickname } from '../data/nicknames.js'
import { leaderboards, forgetMe } from '../lib/leaderboards.js'
import { boardError } from '../data/leaderboards.js'
import { Button, Modal } from './ui.jsx'

/**
 * The nickname builder: a first word, a second word and a number, each picked
 * from a list (src/data/nicknames.js), or shuffled. Nothing is typed, so no
 * name, school or town can reach a stranger through it. The server accepts
 * only names built from the lists, once a week.
 */
export default function NicknameBuilder({ kidId, current, canRename = true, renameAt = null, onSaved, open, onClose }) {
  const start = nicknamePieces(current) || { first: FIRST_WORDS[0], second: SECOND_WORDS[0], number: 42 }
  const [pick, setPick] = useState(start)
  const [tab, setTab] = useState('first')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const name = nicknameFrom(pick.first, pick.second, pick.number)

  const save = async () => {
    setBusy(true); setError('')
    const res = await leaderboards.setNickname(kidId, pick)
    setBusy(false)
    if (!res.ok) { setError(boardError(res.reason)); return }
    forgetMe(kidId)
    onSaved?.(res.nickname)
    onClose?.()
  }

  const lists = {
    first: FIRST_WORDS,
    second: SECOND_WORDS,
    number: Array.from({ length: 100 }, (_, i) => i),
  }
  const label = { first: 'First word', second: 'Second word', number: 'Number' }

  return (
    <Modal open={open} onClose={onClose} title="Build your nickname"
      footer={(
        <div className="flex gap-2 w-full">
          <Button variant="ghost" className="flex-1" onClick={() => setPick(shuffleNickname())} data-testid="nickname-shuffle">
            🎲 Shuffle
          </Button>
          <Button className="flex-1" disabled={busy || !canRename || name === current} onClick={save} data-testid="nickname-save">
            {busy ? 'Saving…' : 'Use this name'}
          </Button>
        </div>
      )}>
      <div className="text-center mb-3">
        <div className="text-[11px] uppercase tracking-widest text-muted">On the leaderboards you are</div>
        <div className="font-display font-extrabold text-2xl mt-1" data-testid="nickname-preview"
          style={{ color: 'var(--accent)', textShadow: '0 0 18px color-mix(in srgb, var(--accent) 50%, transparent)' }}>
          {name}
        </div>
        <p className="text-[11px] text-muted mt-1">
          Pick each part. No typing, so nobody can tell who you really are.
          {canRename ? ` You can change it once every ${NICKNAME_CHANGE_DAYS} days.` : ''}
        </p>
        {!canRename && (
          <p className="text-xs mt-1" style={{ color: 'var(--warn)' }}>
            You can change your nickname again {renameAt ? `on ${new Date(renameAt).toLocaleDateString(undefined, { weekday: 'long' })}` : 'next week'}.
          </p>
        )}
      </div>
      <div className="flex gap-1.5 mb-2" role="group" aria-label="Part">
        {Object.keys(lists).map((k) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}
            className="flex-1 rounded-xl py-2 text-xs font-bold"
            style={{
              background: tab === k ? 'var(--accent)' : 'var(--surface-2)',
              color: tab === k ? 'var(--bg)' : 'var(--ink)',
            }}>
            {label[k]}
            <span className="block font-display text-sm">{k === 'number' ? String(pick.number).padStart(2, '0') : pick[k]}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5 max-h-56 overflow-y-auto pr-1" data-testid={`nickname-${tab}`}>
        {lists[tab].map((w) => {
          const on = pick[tab] === w
          return (
            <button key={w} type="button" aria-pressed={on} onClick={() => setPick((p) => ({ ...p, [tab]: w }))}
              className="rounded-lg py-2 text-xs font-semibold truncate"
              style={{
                background: on ? 'color-mix(in srgb, var(--accent) 22%, var(--surface-2))' : 'var(--surface-2)',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
              }}>
              {tab === 'number' ? String(w).padStart(2, '0') : w}
            </button>
          )
        })}
      </div>
      {error && <p className="text-sm mt-2" style={{ color: 'var(--bad)' }} role="alert">{error}</p>}
    </Modal>
  )
}
