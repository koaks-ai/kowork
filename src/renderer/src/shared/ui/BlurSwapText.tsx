import { useEffect, useRef, useState } from 'react'

type BlurSwapPhase = 'idle' | 'out' | 'in'

const BLUR_OUT_DURATION_MS = 180
const BLUR_IN_DURATION_MS = 360

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

  return (
    <span
      className={`kowork-blur-swap ${className}`}
      aria-live="polite"
      aria-atomic="true"
      data-blur-swap
    >
      <span className="kowork-blur-swap-text" data-phase={phase}>
        {displayedValue}
      </span>
    </span>
  )
}
