import { Slot } from '@radix-ui/react-slot'
import * as React from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../internal/cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  asChild?: boolean
  children: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  asChild = false,
  className,
  children,
  ...props
}: ButtonProps): React.JSX.Element {
  const Component = asChild ? Slot : 'button'
  return (
    <Component
      {...props}
      type={asChild ? props.type : (props.type ?? 'button')}
      data-button
      data-variant={variant}
      data-size={size}
      className={cx('kw-button', `kw-button-${variant}`, `kw-button-${size}`, className)}
    >
      {children}
    </Component>
  )
}
