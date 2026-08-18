import * as Tooltip from '@radix-ui/react-tooltip'
import * as React from 'react'
import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'
import { useRef, useState } from 'react'
import { cx } from '../internal/cx'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  active?: boolean
}

export function IconButton({
  label,
  active = false,
  children,
  className,
  ...props
}: PropsWithChildren<IconButtonProps>): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <Tooltip.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) return setOpen(false)
        const trigger = triggerRef.current
        if (trigger?.matches(':hover') || trigger?.matches(':focus-visible')) setOpen(true)
      }}
    >
      <Tooltip.Trigger asChild>
        <button
          {...props}
          ref={triggerRef}
          type={props.type ?? 'button'}
          aria-label={label}
          aria-pressed={active}
          data-icon-button
          data-selected={active || undefined}
          className={cx('kw-icon-button', active && 'is-active', className)}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={6} className="kw-tooltip">
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
