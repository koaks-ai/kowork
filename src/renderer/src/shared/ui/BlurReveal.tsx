import type { ReactNode } from 'react'

type BlurRevealState = 'open' | 'closed'

interface BlurRevealProps {
  children: ReactNode
  className?: string
  /** Change this to replay the blur-in when swapping whole views. */
  contentKey?: string | number
  /** Play the exit animation before unmounting. Defaults to 'open'. */
  state?: BlurRevealState
}

export function BlurReveal({
  children,
  className = '',
  contentKey,
  state = 'open'
}: BlurRevealProps): React.JSX.Element {
  return (
    <div
      key={contentKey}
      data-blur-reveal
      data-state={state}
      className={`kowork-blur-reveal ${className}`.trim()}
    >
      {children}
    </div>
  )
}
