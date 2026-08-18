import { Slot } from '@radix-ui/react-slot'
import * as React from 'react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode
} from 'react'
import { cx } from '../internal/cx'

export type RevealState = 'open' | 'closed'
export type RevealVariant = 'default' | 'from-bottom' | 'dialog' | 'overlay' | 'stream'

export interface RevealProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
  state?: RevealState
  variant?: RevealVariant
  contentKey?: string | number
  onExitComplete?(): void
  asChild?: boolean
  ref?: React.Ref<HTMLElement>
}

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

export function Reveal({
  children,
  className,
  state = 'open',
  variant = 'default',
  contentKey,
  onExitComplete,
  asChild = false,
  onAnimationEnd,
  ref: forwardedRef,
  ...props
}: RevealProps): React.JSX.Element {
  const elementRef = useRef<HTMLElement>(null)
  const stateRef = useRef(state)
  const onExitCompleteRef = useRef(onExitComplete)
  const exitHandled = useRef(false)
  const Component = asChild ? Slot : 'div'

  const composedRef = useCallback(
    (element: HTMLElement | null) => {
      elementRef.current = element
      assignRef(forwardedRef, element)
    },
    [forwardedRef]
  )

  useLayoutEffect(() => {
    stateRef.current = state
    onExitCompleteRef.current = onExitComplete
  }, [onExitComplete, state])

  useEffect(() => {
    if (state === 'open') exitHandled.current = false
  }, [contentKey, state])

  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    const handleAnimationEnd = (event: AnimationEvent): void => {
      const exitAnimation =
        !event.animationName ||
        event.animationName.includes('kw-reveal-exit') ||
        event.animationName === 'kw-fade-out'
      if (
        stateRef.current === 'closed' &&
        event.target === element &&
        exitAnimation &&
        !exitHandled.current
      ) {
        exitHandled.current = true
        onExitCompleteRef.current?.()
      }
    }
    element.addEventListener('animationend', handleAnimationEnd)
    return () => element.removeEventListener('animationend', handleAnimationEnd)
  }, [asChild, contentKey])

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    if (state === 'closed' && prefersReducedMotion && !exitHandled.current) {
      exitHandled.current = true
      onExitCompleteRef.current?.()
    }
  }, [contentKey, state])

  return (
    <Component
      {...props}
      ref={composedRef as React.Ref<HTMLDivElement>}
      key={contentKey}
      data-reveal
      data-reveal-variant={variant}
      data-state={props['data-state'] ?? state}
      className={cx('kw-reveal', `kw-reveal-${variant}`, className)}
      onAnimationEnd={onAnimationEnd}
    >
      {children}
    </Component>
  )
}
