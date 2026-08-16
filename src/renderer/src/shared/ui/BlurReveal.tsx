import type { ReactNode } from 'react'

interface BlurRevealProps {
  children: ReactNode
  className?: string
  /** Change this to replay the blur-in when swapping whole views. */
  contentKey?: string | number
}

export function BlurReveal({
  children,
  className = '',
  contentKey
}: BlurRevealProps): React.JSX.Element {
  return (
    <div key={contentKey} data-blur-reveal className={`kowork-blur-reveal ${className}`.trim()}>
      {children}
    </div>
  )
}
