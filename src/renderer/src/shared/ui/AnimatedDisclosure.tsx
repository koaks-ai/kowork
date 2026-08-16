import { useEffect, useLayoutEffect, useRef, useState } from 'react'

interface AnimatedDisclosureProps {
  open: boolean
  children?: React.ReactNode
  id?: string
  className?: string
  contentClassName?: string
}

export function AnimatedDisclosure({
  open,
  children,
  id,
  className = '',
  contentClassName = ''
}: AnimatedDisclosureProps): React.JSX.Element {
  const content = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)
  const [revealed, setRevealed] = useState(false)

  useLayoutEffect(() => {
    const element = content.current
    if (!element) return

    const measure = (): void => setContentHeight(element.scrollHeight)
    measure()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const frame = requestAnimationFrame(() => setRevealed(open))
    return () => cancelAnimationFrame(frame)
  }, [open])

  const visible = open && revealed

  return (
    <div
      id={id}
      aria-hidden={!open}
      data-animated-disclosure
      data-state={open ? 'open' : 'closed'}
      className={`kowork-disclosure ${visible ? 'is-open' : ''} ${className}`}
      style={{ height: visible ? contentHeight : 0 }}
    >
      <div ref={content} className={`kowork-disclosure-content ${contentClassName}`}>
        {children}
      </div>
    </div>
  )
}
