import { useEffect, useRef, useState } from 'react'
import { CODE_LENGTH, normaliseCode } from '../lib/pairing.js'

/**
 * Six boxes for a six-digit code.
 *
 * Behind the boxes is one real input, not six. Six separate inputs are the
 * common approach and they fight the phone constantly: autofill puts the whole
 * code in the first box, backspace at an empty box goes nowhere, and pasting
 * fills one box and drops the rest. One input with the digits drawn on top
 * gets paste, autofill, backspace and the SMS one-time-code keyboard for free.
 */
export default function CodeInput({ value, onChange, onComplete, disabled, invalid, autoFocus = true }) {
  const inputRef = useRef(null)
  const [focused, setFocused] = useState(false)
  const digits = normaliseCode(value)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const handle = (raw) => {
    const next = normaliseCode(raw)
    onChange(next)
    if (next.length === CODE_LENGTH) {
      inputRef.current?.blur()
      onComplete?.(next)
    }
  }

  const activeIndex = Math.min(digits.length, CODE_LENGTH - 1)

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={CODE_LENGTH}
        value={digits}
        disabled={disabled}
        onChange={(e) => handle(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label="Six digit pairing code"
        className="absolute inset-0 w-full h-full opacity-0"
        style={{ caretColor: 'transparent' }}
      />
      <div className="flex gap-2 justify-center pointer-events-none" aria-hidden="true">
        {Array.from({ length: CODE_LENGTH }).map((_, i) => {
          const filled = i < digits.length
          const isCursor = focused && !disabled && i === activeIndex && digits.length < CODE_LENGTH
          return (
            <div
              key={i}
              className="flex-1 max-w-[52px] aspect-[3/4] flex items-center justify-center font-mono font-bold text-2xl transition-colors"
              style={{
                background: 'var(--surface-2)',
                border: `2px solid ${
                  invalid ? 'var(--bad)' : isCursor ? 'var(--accent)' : filled ? 'var(--line)' : 'var(--line)'
                }`,
                borderRadius: 'var(--radius)',
                color: invalid ? 'var(--bad)' : 'var(--ink)',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {filled ? digits[i] : isCursor ? <span className="w-0.5 h-6 bg-[var(--accent)] anim-pulse" /> : ''}
            </div>
          )
        })}
      </div>
    </div>
  )
}
