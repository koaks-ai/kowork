import * as Tooltip from '@radix-ui/react-tooltip'
import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'
import { useRef, useState } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  active?: boolean
}

export function IconButton({
  label,
  active,
  children,
  className = '',
  ...props
}: PropsWithChildren<IconButtonProps>): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <Tooltip.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setOpen(false)
          return
        }
        const trigger = triggerRef.current
        if (trigger?.matches(':hover') || trigger?.matches(':focus-visible')) {
          setOpen(true)
        }
      }}
    >
      <Tooltip.Trigger asChild>
        <button
          className={`no-drag inline-flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'bg-blue-50 text-blue-700' : ''} ${className}`}
          aria-label={label}
          {...props}
          ref={triggerRef}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={6}
          className="z-[60] rounded bg-neutral-900 px-2 py-1 text-xs text-white shadow-lg"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
