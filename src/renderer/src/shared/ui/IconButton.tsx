import * as Tooltip from '@radix-ui/react-tooltip'
import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

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
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          className={`no-drag inline-flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'bg-blue-50 text-blue-700' : ''} ${className}`}
          aria-label={label}
          {...props}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={6}
          className="z-50 rounded bg-neutral-900 px-2 py-1 text-xs text-white shadow-lg"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
