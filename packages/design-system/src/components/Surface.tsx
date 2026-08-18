import { Slot } from '@radix-ui/react-slot'
import * as React from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '../internal/cx'

export type SurfaceVariant = 'card' | 'panel' | 'popover' | 'dialog'

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  variant?: SurfaceVariant
  asChild?: boolean
  children: ReactNode
}

export function Surface({
  variant = 'card',
  asChild = false,
  className,
  children,
  ...props
}: SurfaceProps): React.JSX.Element {
  const Component = asChild ? Slot : 'div'
  return (
    <Component {...props} data-surface={variant} className={cx('kw-surface', `kw-surface-${variant}`, className)}>
      {children}
    </Component>
  )
}
