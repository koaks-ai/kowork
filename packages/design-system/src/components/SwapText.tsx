import * as React from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cx } from '../internal/cx'

type SwapPhase = 'idle' | 'out' | 'in'

interface SwapTextProps {
  value: string
  fallback?: string
  className?: string
}

function reducedMotion(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

export function SwapText({ value, fallback = '', className = '' }: SwapTextProps): React.JSX.Element {
  const resolvedValue = value || fallback
  const [displayedValue, setDisplayedValue] = useState(resolvedValue)
  const [phase, setPhase] = useState<SwapPhase>('idle')
  const target = useRef(resolvedValue)
  const outer = useRef<HTMLSpanElement>(null)
  const inner = useRef<HTMLSpanElement>(null)
  const previousWidth = useRef<number | null>(null)
  const phaseRef = useRef<SwapPhase>(phase)
  const displayedValueRef = useRef(displayedValue)

  useLayoutEffect(() => {
    target.current = resolvedValue
    phaseRef.current = phase
    displayedValueRef.current = displayedValue
  }, [displayedValue, phase, resolvedValue])

  useEffect(() => {
    if (resolvedValue === displayedValue) return
    const frame = requestAnimationFrame(() => {
      if (reducedMotion()) {
        setDisplayedValue(target.current)
        setPhase('idle')
      } else setPhase('out')
    })
    return () => cancelAnimationFrame(frame)
  }, [displayedValue, resolvedValue])

  useEffect(() => {
    const element = inner.current
    if (!element) return
    const finishPhase = (): void => {
      if (phaseRef.current === 'out') {
        setDisplayedValue(target.current)
        setPhase('in')
      } else if (phaseRef.current === 'in') {
        setPhase(target.current === displayedValueRef.current ? 'idle' : 'out')
      }
    }
    element.addEventListener('animationend', finishPhase)
    return () => element.removeEventListener('animationend', finishPhase)
  }, [])

  useLayoutEffect(() => {
    const outerElement = outer.current
    const innerElement = inner.current
    if (!outerElement || !innerElement) return
    const naturalWidth = innerElement.scrollWidth
    if (reducedMotion()) {
      outerElement.style.maxWidth = ''
      previousWidth.current = naturalWidth
      return
    }
    outerElement.style.setProperty('--kw-swap-start-width', `${previousWidth.current ?? naturalWidth}px`)
    outerElement.style.setProperty('--kw-swap-end-width', `${naturalWidth}px`)
    previousWidth.current = naturalWidth
  }, [displayedValue])

  return (
    <span ref={outer} className={cx('kw-swap-text', className)} aria-live="polite" aria-atomic="true">
      <span
        ref={inner}
        className="kw-swap-text-value"
        data-phase={phase}
      >
        {displayedValue}
      </span>
    </span>
  )
}
