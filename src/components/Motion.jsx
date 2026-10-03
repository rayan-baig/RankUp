import { Fragment, useEffect, useRef, useState } from 'react'

/**
 * The two bits of motion that need JavaScript.
 *
 * Everything else in this app animates from the stylesheet, which is where
 * animation belongs — it costs no React renders and it is switched off by the
 * reduce-motion rule at the top of index.css without any component knowing.
 * These two cannot be done that way: a word stagger needs the words split up,
 * and a number counting needs the intermediate numbers to exist.
 *
 * Both check reduce-motion themselves, because both would otherwise keep
 * moving even with every CSS animation disabled.
 */

/** True when this person has asked their device for less movement. */
export function useStillness() {
  const [still, setStill] = useState(
    () => typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return undefined
    const onChange = (e) => setStill(e.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return still
}

/**
 * A heading whose words arrive one after another.
 *
 * Split on spaces and each word wrapped, with the stagger carried on a custom
 * property.
 *
 * The space between words is an ordinary text node OUTSIDE the spans, and that
 * detail cost a test. The first version put a non-breaking space inside each
 * span, which looks identical on screen and is not identical at all: the
 * heading's text became "Hi<nbsp>Ava" rather than "Hi Ava", so anything
 * reading it — a test, a screen reader, somebody copying it — got something
 * subtly different from what was rendered. Inline-block siblings separated by
 * an ordinary space keep their gap anyway. The non-breaking space after each word is deliberate: without it
 * inline-block words lose the space between them entirely and the heading
 * readsLikeThis.
 *
 * Renders the plain string when motion is off, rather than a pile of spans
 * that do nothing.
 */
export function Words({ children, className = '', as: Tag = 'span' }) {
  const still = useStillness()
  const text = String(children ?? '')
  if (still) return <Tag className={className}>{text}</Tag>

  const words = text.split(' ')
  return (
    <Tag className={`anim-words ${className}`}>
      {words.map((word, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <Fragment key={`${word}-${i}`}>
          <span style={{ '--i': Math.min(i, 8) }}>{word}</span>
          {i < words.length - 1 ? ' ' : ''}
        </Fragment>
      ))}
    </Tag>
  )
}

/**
 * A number that counts to its value, and bumps whenever it changes.
 *
 * This is the one piece of motion in the app that is doing a job rather than
 * being nice: a child who watches 158 climb to 203 has felt the reward, and a
 * child who sees the number already sitting there has been told about it.
 *
 * The count runs on requestAnimationFrame against real elapsed time rather
 * than a fixed number of steps, so a slow phone shows fewer frames of the same
 * animation instead of taking twice as long to finish it.
 */
export function CountUp({
  value,
  // Where to start, for the cases where the interesting thing is the journey
  // rather than the change: a level-up counts from the old level, even though
  // this component has only just been mounted and has nothing to compare to.
  from: startAt = null,
  format = (n) => n,
  className = '',
  duration = 650,
}) {
  const still = useStillness()
  const [shown, setShown] = useState(startAt ?? value)
  const from = useRef(startAt ?? value)
  const frame = useRef(0)
  const node = useRef(null)

  useEffect(() => {
    if (still || from.current === value) {
      from.current = value
      setShown(value)
      return undefined
    }

    // Re-trigger the bump even when one is already running.
    if (node.current) {
      node.current.classList.remove('anim-bump')
      // Reading offsetWidth forces the style change to land, which is what
      // makes removing and re-adding the class restart the animation.
      void node.current.offsetWidth
      node.current.classList.add('anim-bump')
    }

    const start = performance.now()
    const begin = from.current
    const delta = value - begin

    const step = (now) => {
      const t = Math.min(1, (now - start) / duration)
      // Ease out: most of the distance early, so it reads as landing rather
      // than as a progress bar.
      const eased = 1 - (1 - t) ** 3
      setShown(Math.round(begin + delta * eased))
      if (t < 1) frame.current = requestAnimationFrame(step)
      else from.current = value
    }
    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
  }, [value, still, duration])

  return <span ref={node} className={className}>{format(shown)}</span>
}
