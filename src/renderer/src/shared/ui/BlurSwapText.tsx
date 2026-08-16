import { useEffect, useLayoutEffect, useRef, useState } from 'react'

type BlurSwapPhase = 'idle' | 'out' | 'in'

const BLUR_OUT_DURATION_MS = 120
const BLUR_IN_DURATION_MS = 320
const WIDTH_TRANSITION_MS = 200

interface BlurSwapTextProps {
  value: string
  fallback?: string
  className?: string
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

export function BlurSwapText({
  value,
  fallback = '',
  className = ''
}: BlurSwapTextProps): React.JSX.Element {
  const resolvedValue = value || fallback
  const [displayedValue, setDisplayedValue] = useState(resolvedValue)
  const [phase, setPhase] = useState<BlurSwapPhase>('idle')
  const targetValue = useRef(resolvedValue)
  const outerRef = useRef<HTMLSpanElement>(null)
  const innerRef = useRef<HTMLSpanElement>(null)
  const previousWidth = useRef<number | null>(null)

  useEffect(() => {
    targetValue.current = resolvedValue
    if (resolvedValue === displayedValue) return
    const frame = requestAnimationFrame(() => {
      if (prefersReducedMotion()) {
        setDisplayedValue(targetValue.current)
        setPhase('idle')
      } else {
        setPhase('out')
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [displayedValue, resolvedValue])

  useEffect(() => {
    if (phase === 'idle') return
    const timeout = window.setTimeout(
      () => {
        if (phase === 'out') {
          setDisplayedValue(targetValue.current)
          setPhase('in')
        } else {
          setPhase(targetValue.current === displayedValue ? 'idle' : 'out')
        }
      },
      phase === 'out' ? BLUR_OUT_DURATION_MS : BLUR_IN_DURATION_MS
    )
    return () => window.clearTimeout(timeout)
  }, [displayedValue, phase])

  // Animate the outer width from the previous natural width to the new one so
  // neighbouring elements (e.g. the edit pencil) glide instead of jumping.
  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    const naturalWidth = inner.scrollWidth
    if (prefersReducedMotion()) {
      outer.style.transition = ''
      outer.style.maxWidth = ''
      previousWidth.current = naturalWidth
      return
    }
    const startWidth = previousWidth.current ?? naturalWidth
    outer.style.transition = 'none'
    outer.style.maxWidth = `${startWidth}px`
    outer.getBoundingClientRect()
    outer.style.transition = `max-width ${WIDTH_TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
    outer.style.maxWidth = `${naturalWidth}px`
    previousWidth.current = naturalWidth
  }, [displayedValue])

  return (
    <span
      ref={outerRef}
      className={`kowork-blur-swap ${className}`}
      aria-live="polite"
      aria-atomic="true"
      data-blur-swap
    >
      <span ref={innerRef} className="kowork-blur-swap-text" data-phase={phase}>
        {displayedValue}
      </span>
    </span>
  )
}
